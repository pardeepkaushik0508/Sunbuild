import "server-only";

import { prisma } from "@/lib/db";
import { GOOGLE_SYNC_ACTIVITY_TYPES } from "@/lib/google/config";
import type { GoogleSyncStatus } from "@/lib/google/types";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  updateGoogleEvent,
} from "@/lib/google/calendar";

const PENDING_SYNC_STATUSES = [
  "LOCAL_ONLY",
  "SYNC_ERROR",
  "RECONNECT_REQUIRED",
] as const;

/** In-process lock so concurrent callback/status/manual backfills don't double-create. */
const backfillLocks = new Map<
  string,
  Promise<{ tasks: number; schedule: number; activities: number }>
>();

/** Abandoned SYNCING older than this is reclaimable. */
const STALE_SYNCING_MS = 5 * 60_000;

function endOfTimedEvent(start: Date, end?: Date | null): Date {
  if (end && end.getTime() > start.getTime()) return end;
  return new Date(start.getTime() + 60 * 60 * 1000);
}

/** True when the Date looks like a date-only value (UTC midnight). */
function isDateOnlyMidnight(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

function allDayEndExclusive(start: Date, end?: Date | null): Date {
  const base =
    end && end.getTime() > start.getTime() ? new Date(end) : new Date(start);
  // Google all-day end is exclusive — advance one calendar day.
  base.setUTCDate(base.getUTCDate() + 1);
  return base;
}

export async function userHasGoogleConnection(
  userId: string,
  companyId: string
): Promise<boolean> {
  const row = await prisma.googleCalendarConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { status: true },
  });
  return row?.status === "CONNECTED";
}

/**
 * First preferred user who has an active Google Calendar connection.
 * Never uses process.env.PORT / internal hosts — connection is DB-backed.
 */
export async function resolveGoogleSyncUserId(
  companyId: string,
  preferredUserIds: Array<string | null | undefined>
): Promise<string | null> {
  const seen = new Set<string>();
  for (const id of preferredUserIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (await userHasGoogleConnection(id, companyId)) return id;
  }
  return null;
}

async function setScheduleSync(
  id: string,
  data: {
    googleEventId?: string | null;
    googleCalendarId?: string | null;
    googleMeetUrl?: string | null;
    googleSyncStatus: GoogleSyncStatus;
    googleLastSyncedAt?: Date | null;
  }
) {
  await prisma.scheduleItem.update({
    where: { id },
    data,
  });
}

async function setLeadActivitySync(
  id: string,
  data: {
    googleEventId?: string | null;
    googleCalendarId?: string | null;
    googleMeetUrl?: string | null;
    googleSyncStatus: GoogleSyncStatus;
    googleLastSyncedAt?: Date | null;
  }
) {
  await prisma.leadActivity.update({
    where: { id },
    data,
  });
}

async function setTaskSync(
  id: string,
  data: {
    googleEventId?: string | null;
    googleCalendarId?: string | null;
    googleMeetUrl?: string | null;
    googleSyncStatus: GoogleSyncStatus;
    googleLastSyncedAt?: Date | null;
  }
) {
  await prisma.task.update({
    where: { id },
    data,
  });
}

/**
 * Atomically claim a task for sync to prevent duplicate Google events under concurrency.
 * Returns false if another worker already claimed it or it already has a googleEventId.
 */
async function claimTaskForSync(taskId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_SYNCING_MS);
  const claimed = await prisma.task.updateMany({
    where: {
      id: taskId,
      googleEventId: null,
      OR: [
        { googleSyncStatus: { in: [...PENDING_SYNC_STATUSES] } },
        {
          googleSyncStatus: "SYNCING",
          googleLastSyncedAt: { lt: staleBefore },
        },
        {
          googleSyncStatus: "SYNCING",
          googleLastSyncedAt: null,
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      googleSyncStatus: "SYNCING",
      googleLastSyncedAt: new Date(),
    },
  });
  return claimed.count === 1;
}

async function claimScheduleForSync(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_SYNCING_MS);
  const claimed = await prisma.scheduleItem.updateMany({
    where: {
      id,
      googleEventId: null,
      OR: [
        { googleSyncStatus: { in: [...PENDING_SYNC_STATUSES] } },
        {
          googleSyncStatus: "SYNCING",
          googleLastSyncedAt: { lt: staleBefore },
        },
        {
          googleSyncStatus: "SYNCING",
          googleLastSyncedAt: null,
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      googleSyncStatus: "SYNCING",
      googleLastSyncedAt: new Date(),
    },
  });
  return claimed.count === 1;
}

async function claimActivityForSync(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_SYNCING_MS);
  const claimed = await prisma.leadActivity.updateMany({
    where: {
      id,
      googleEventId: null,
      OR: [
        { googleSyncStatus: { in: [...PENDING_SYNC_STATUSES] } },
        {
          googleSyncStatus: "SYNCING",
          googleLastSyncedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      googleSyncStatus: "SYNCING",
      googleLastSyncedAt: new Date(),
    },
  });
  return claimed.count === 1;
}

/**
 * Push a dated task to Google Calendar.
 * Tries preferred users in order (assignee → creator → session) until one
 * has a connected Google account.
 */
export async function syncTaskToGoogle(input: {
  companyId: string;
  taskId: string;
  preferredUserIds: Array<string | null | undefined>;
}): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    include: {
      project: { select: { name: true } },
    },
  });
  if (!task?.dueDate) {
    if (task) {
      await setTaskSync(task.id, { googleSyncStatus: "LOCAL_ONLY" });
    }
    return;
  }

  const googleUserId = await resolveGoogleSyncUserId(
    input.companyId,
    input.preferredUserIds
  );
  if (!googleUserId) {
    await setTaskSync(task.id, { googleSyncStatus: "LOCAL_ONLY" });
    return;
  }

  // Updates with an existing Google event skip the create-claim path.
  if (!task.googleEventId) {
    const claimed = await claimTaskForSync(task.id);
    if (!claimed) {
      const again = await prisma.task.findUnique({
        where: { id: task.id },
        select: { googleEventId: true, googleSyncStatus: true },
      });
      if (again?.googleEventId || again?.googleSyncStatus === "SYNCING") {
        console.info("[google-sync] task claim skipped (concurrent)", {
          taskId: task.id,
        });
        return;
      }
      await setTaskSync(task.id, { googleSyncStatus: "SYNCING" });
    }
  } else {
    await setTaskSync(task.id, { googleSyncStatus: "SYNCING" });
  }

  const start =
    task.startDate && task.startDate.getTime() <= task.dueDate.getTime()
      ? task.startDate
      : task.dueDate;
  const useAllDay =
    isDateOnlyMidnight(start) &&
    (!task.startDate || isDateOnlyMidnight(task.startDate));
  const end = useAllDay
    ? allDayEndExclusive(start, task.dueDate)
    : endOfTimedEvent(start, task.dueDate);
  const description = [
    task.description,
    `Project: ${task.project.name}`,
    `Priority: ${task.priority}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (task.googleEventId) {
      const updated = await updateGoogleEvent(
        googleUserId,
        input.companyId,
        task.googleEventId,
        {
          summary: task.title,
          description,
          start,
          end,
          allDay: useAllDay,
          googleCalendarId: task.googleCalendarId || undefined,
        }
      );
      if (!updated) {
        await setTaskSync(task.id, { googleSyncStatus: "RECONNECT_REQUIRED" });
        return;
      }
      await setTaskSync(task.id, {
        googleSyncStatus: "SYNCED",
        googleLastSyncedAt: new Date(),
      });
      return;
    }

    const created = await createGoogleEvent(googleUserId, input.companyId, {
      summary: task.title,
      description,
      start,
      end,
      allDay: useAllDay,
    });

    if (!created) {
      await setTaskSync(task.id, { googleSyncStatus: "LOCAL_ONLY" });
      return;
    }

    await setTaskSync(task.id, {
      googleEventId: created.googleEventId,
      googleCalendarId: created.googleCalendarId,
      googleMeetUrl: created.googleMeetUrl,
      googleSyncStatus: "SYNCED",
      googleLastSyncedAt: new Date(),
    });
  } catch (err) {
    console.error("[google-sync] task push failed:", {
      taskId: task.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    await setTaskSync(task.id, { googleSyncStatus: "SYNC_ERROR" });
  }
}

/**
 * Push a schedule item to Google after local save.
 * Never throws — marks SYNC_ERROR / RECONNECT_REQUIRED instead.
 */
export async function syncScheduleItemToGoogle(input: {
  userId: string;
  companyId: string;
  scheduleItemId: string;
  createMeet?: boolean;
  attendees?: Array<{ email: string; displayName?: string }>;
}): Promise<void> {
  const item = await prisma.scheduleItem.findUnique({
    where: { id: input.scheduleItemId },
  });
  if (!item) return;

  const googleUserId =
    (await resolveGoogleSyncUserId(input.companyId, [input.userId])) ||
    input.userId;

  if (!item.googleEventId) {
    const claimed = await claimScheduleForSync(item.id);
    if (!claimed) {
      const again = await prisma.scheduleItem.findUnique({
        where: { id: item.id },
        select: { googleEventId: true, googleSyncStatus: true },
      });
      if (again?.googleEventId || again?.googleSyncStatus === "SYNCING") {
        return;
      }
    }
  } else {
    await setScheduleSync(item.id, { googleSyncStatus: "SYNCING" });
  }

  try {
    if (item.googleEventId) {
      const updated = await updateGoogleEvent(
        googleUserId,
        input.companyId,
        item.googleEventId,
        {
          summary: item.title,
          description: item.trade ? `Trade: ${item.trade}` : null,
          location: item.location,
          start: item.startDate,
          end: endOfTimedEvent(item.startDate, item.endDate),
          googleCalendarId: item.googleCalendarId || undefined,
          createMeet: input.createMeet && !item.googleMeetUrl,
          attendees: input.attendees,
        }
      );
      if (!updated) {
        await setScheduleSync(item.id, {
          googleSyncStatus: "RECONNECT_REQUIRED",
        });
        return;
      }
      await setScheduleSync(item.id, {
        googleSyncStatus: "SYNCED",
        googleLastSyncedAt: new Date(),
        googleMeetUrl: updated.googleMeetUrl || item.googleMeetUrl,
      });
      return;
    }

    const created = await createGoogleEvent(googleUserId, input.companyId, {
      summary: item.title,
      description: item.trade ? `Trade: ${item.trade}` : null,
      location: item.location,
      start: item.startDate,
      end: endOfTimedEvent(item.startDate, item.endDate),
      createMeet: Boolean(input.createMeet),
      attendees: input.attendees,
    });

    if (!created) {
      await setScheduleSync(item.id, {
        googleSyncStatus: "RECONNECT_REQUIRED",
      });
      return;
    }

    await setScheduleSync(item.id, {
      googleEventId: created.googleEventId,
      googleCalendarId: created.googleCalendarId,
      googleMeetUrl: created.googleMeetUrl,
      googleSyncStatus: "SYNCED",
      googleLastSyncedAt: new Date(),
    });
  } catch (err) {
    console.error("[google-sync] schedule push failed:", {
      scheduleItemId: item.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    await setScheduleSync(item.id, { googleSyncStatus: "SYNC_ERROR" });
  }
}

export async function syncLeadActivityToGoogle(input: {
  userId: string;
  companyId: string;
  activityId: string;
  createMeet?: boolean;
  attendees?: Array<{ email: string; displayName?: string }>;
}): Promise<void> {
  const activity = await prisma.leadActivity.findUnique({
    where: { id: input.activityId },
    include: {
      lead: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });
  if (!activity || !activity.dueAt) return;
  if (!GOOGLE_SYNC_ACTIVITY_TYPES.has(activity.type)) {
    await setLeadActivitySync(activity.id, { googleSyncStatus: "LOCAL_ONLY" });
    return;
  }

  const googleUserId =
    (await resolveGoogleSyncUserId(input.companyId, [
      input.userId,
      activity.userId,
    ])) || input.userId;

  if (!activity.googleEventId) {
    const claimed = await claimActivityForSync(activity.id);
    if (!claimed) {
      const again = await prisma.leadActivity.findUnique({
        where: { id: activity.id },
        select: { googleEventId: true, googleSyncStatus: true },
      });
      if (again?.googleEventId || again?.googleSyncStatus === "SYNCING") {
        return;
      }
    }
  } else {
    await setLeadActivitySync(activity.id, { googleSyncStatus: "SYNCING" });
  }

  const title =
    activity.title?.trim() ||
    `${activity.type.replace(/_/g, " ")} — ${activity.lead.firstName} ${activity.lead.lastName}`;

  const attendees = [...(input.attendees ?? [])];
  if (
    activity.lead.email &&
    !attendees.some(
      (a) => a.email.toLowerCase() === activity.lead.email!.toLowerCase()
    )
  ) {
    if (activity.type === "MEETING" || activity.type === "CONSULTATION") {
      attendees.push({
        email: activity.lead.email,
        displayName: `${activity.lead.firstName} ${activity.lead.lastName}`,
      });
    }
  }

  try {
    if (activity.googleEventId) {
      const updated = await updateGoogleEvent(
        googleUserId,
        input.companyId,
        activity.googleEventId,
        {
          summary: title,
          description: activity.content,
          location: activity.location,
          start: activity.dueAt,
          end: endOfTimedEvent(activity.dueAt),
          googleCalendarId: activity.googleCalendarId || undefined,
          createMeet: input.createMeet && !activity.googleMeetUrl,
          attendees,
        }
      );
      if (!updated) {
        await setLeadActivitySync(activity.id, {
          googleSyncStatus: "RECONNECT_REQUIRED",
        });
        return;
      }
      await setLeadActivitySync(activity.id, {
        googleSyncStatus: "SYNCED",
        googleLastSyncedAt: new Date(),
        googleMeetUrl: updated.googleMeetUrl || activity.googleMeetUrl,
      });
      return;
    }

    const created = await createGoogleEvent(googleUserId, input.companyId, {
      summary: title,
      description: activity.content,
      location: activity.location,
      start: activity.dueAt,
      end: endOfTimedEvent(activity.dueAt),
      createMeet: Boolean(input.createMeet),
      attendees,
    });

    if (!created) {
      await setLeadActivitySync(activity.id, {
        googleSyncStatus: "RECONNECT_REQUIRED",
      });
      return;
    }

    await setLeadActivitySync(activity.id, {
      googleEventId: created.googleEventId,
      googleCalendarId: created.googleCalendarId,
      googleMeetUrl: created.googleMeetUrl,
      googleSyncStatus: "SYNCED",
      googleLastSyncedAt: new Date(),
    });
  } catch (err) {
    console.error("[google-sync] lead activity push failed:", {
      activityId: activity.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    await setLeadActivitySync(activity.id, { googleSyncStatus: "SYNC_ERROR" });
  }
}

export async function removeScheduleItemFromGoogle(input: {
  userId: string;
  companyId: string;
  scheduleItemId: string;
}): Promise<void> {
  const item = await prisma.scheduleItem.findUnique({
    where: { id: input.scheduleItemId },
    select: {
      id: true,
      googleEventId: true,
      googleCalendarId: true,
    },
  });
  if (!item?.googleEventId) return;
  await deleteGoogleEvent(
    input.userId,
    input.companyId,
    item.googleEventId,
    item.googleCalendarId || undefined
  );
  await setScheduleSync(item.id, {
    googleSyncStatus: "LOCAL_ONLY",
    googleEventId: null,
    googleCalendarId: null,
    googleMeetUrl: null,
    googleLastSyncedAt: null,
  });
}

export async function removeLeadActivityFromGoogle(input: {
  userId: string;
  companyId: string;
  activityId: string;
}): Promise<void> {
  const activity = await prisma.leadActivity.findUnique({
    where: { id: input.activityId },
    select: {
      id: true,
      googleEventId: true,
      googleCalendarId: true,
    },
  });
  if (!activity?.googleEventId) return;
  await deleteGoogleEvent(
    input.userId,
    input.companyId,
    activity.googleEventId,
    activity.googleCalendarId || undefined
  );
  await setLeadActivitySync(activity.id, {
    googleSyncStatus: "LOCAL_ONLY",
    googleEventId: null,
    googleCalendarId: null,
    googleMeetUrl: null,
    googleLastSyncedAt: null,
  });
}

export async function removeTaskFromGoogle(input: {
  userId: string;
  companyId: string;
  taskId: string;
}): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      googleEventId: true,
      googleCalendarId: true,
    },
  });
  if (!task?.googleEventId) return;
  await deleteGoogleEvent(
    input.userId,
    input.companyId,
    task.googleEventId,
    task.googleCalendarId || undefined
  );
  await setTaskSync(task.id, {
    googleSyncStatus: "LOCAL_ONLY",
    googleEventId: null,
    googleCalendarId: null,
    googleMeetUrl: null,
    googleLastSyncedAt: null,
  });
}

/**
 * After Google connects, push pending local tasks / schedule / activities
 * that never made it to Calendar.
 * Concurrent callers for the same user+company share one in-flight run.
 */
export async function backfillGoogleCalendarForUser(input: {
  userId: string;
  companyId: string;
  /** Limit how many of each entity type to push (avoid flooding). */
  limit?: number;
}): Promise<{ tasks: number; schedule: number; activities: number }> {
  const lockKey = `${input.userId}:${input.companyId}`;
  const existing = backfillLocks.get(lockKey);
  if (existing) {
    console.info("[google-sync] backfill joined in-flight run", {
      userId: input.userId,
      companyId: input.companyId,
    });
    return existing;
  }

  const run = (async () => {
    const limit = input.limit ?? 40;
    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - 14);
    const windowEnd = new Date();
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 90);

    let tasks = 0;
    let schedule = 0;
    let activities = 0;

    const pendingTasks = await prisma.task.findMany({
      where: {
        dueDate: { not: null, gte: windowStart, lte: windowEnd },
        googleEventId: null,
        googleSyncStatus: { in: [...PENDING_SYNC_STATUSES] },
        project: { companyId: input.companyId },
        OR: [{ assigneeId: input.userId }, { createdById: input.userId }],
      },
      select: { id: true, assigneeId: true, createdById: true },
      orderBy: { dueDate: "asc" },
      take: limit,
    });

    for (const task of pendingTasks) {
      await syncTaskToGoogle({
        companyId: input.companyId,
        taskId: task.id,
        preferredUserIds: [task.assigneeId, task.createdById, input.userId],
      });
      tasks += 1;
    }

    // Claim prevents multi-user duplicate pushes onto different calendars.
    const pendingSchedule = await prisma.scheduleItem.findMany({
      where: {
        startDate: { gte: windowStart, lte: windowEnd },
        googleEventId: null,
        googleSyncStatus: { in: [...PENDING_SYNC_STATUSES] },
        project: { companyId: input.companyId },
      },
      select: { id: true },
      orderBy: { startDate: "asc" },
      take: limit,
    });

    for (const item of pendingSchedule) {
      await syncScheduleItemToGoogle({
        userId: input.userId,
        companyId: input.companyId,
        scheduleItemId: item.id,
      });
      schedule += 1;
    }

    const pendingActivities = await prisma.leadActivity.findMany({
      where: {
        dueAt: { not: null, gte: windowStart, lte: windowEnd },
        googleEventId: null,
        googleSyncStatus: { in: [...PENDING_SYNC_STATUSES] },
        lead: { companyId: input.companyId },
        OR: [{ userId: input.userId }],
      },
      select: { id: true, userId: true },
      orderBy: { dueAt: "asc" },
      take: limit,
    });

    for (const activity of pendingActivities) {
      await syncLeadActivityToGoogle({
        userId: input.userId,
        companyId: input.companyId,
        activityId: activity.id,
      });
      activities += 1;
    }

    console.info("[google-sync] backfill complete", {
      userId: input.userId,
      companyId: input.companyId,
      tasks,
      schedule,
      activities,
    });

    return { tasks, schedule, activities };
  })();

  backfillLocks.set(lockKey, run);
  try {
    return await run;
  } finally {
    backfillLocks.delete(lockKey);
  }
}

/** Collect googleEventIds already linked in SUNBUILD for dedupe. */
export async function collectSyncedGoogleEventIds(
  companyId: string,
  projectIds: string[]
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (projectIds.length) {
    const [items, tasks] = await Promise.all([
      prisma.scheduleItem.findMany({
        where: {
          projectId: { in: projectIds },
          googleEventId: { not: null },
        },
        select: { googleEventId: true },
      }),
      prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          googleEventId: { not: null },
        },
        select: { googleEventId: true },
      }),
    ]);
    for (const i of items) {
      if (i.googleEventId) ids.add(i.googleEventId);
    }
    for (const t of tasks) {
      if (t.googleEventId) ids.add(t.googleEventId);
    }
  }
  const activities = await prisma.leadActivity.findMany({
    where: {
      googleEventId: { not: null },
      lead: { companyId },
    },
    select: { googleEventId: true },
  });
  for (const a of activities) {
    if (a.googleEventId) ids.add(a.googleEventId);
  }
  return ids;
}

/** Test helper — clear in-process backfill locks. */
export function clearGoogleBackfillLocksForTests(): void {
  backfillLocks.clear();
}
