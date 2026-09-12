import "server-only";

import { prisma } from "@/lib/db";
import { GOOGLE_SYNC_ACTIVITY_TYPES } from "@/lib/google/config";
import type { GoogleSyncStatus } from "@/lib/google/types";
import {
  createGoogleEvent,
  deleteGoogleEvent,
  updateGoogleEvent,
} from "@/lib/google/calendar";

function endOfTimedEvent(start: Date, end?: Date | null): Date {
  if (end && end.getTime() > start.getTime()) return end;
  return new Date(start.getTime() + 60 * 60 * 1000);
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
 * Push a dated task to the assignee's (or creator's) Google Calendar.
 * Used when a task is assigned so it appears on that user's calendar.
 */
export async function syncTaskToGoogle(input: {
  /** Whose Google connection to use (usually assignee, else creator). */
  googleUserId: string;
  companyId: string;
  taskId: string;
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

  await setTaskSync(task.id, { googleSyncStatus: "SYNCING" });

  const start = task.startDate && task.startDate.getTime() <= task.dueDate.getTime()
    ? task.startDate
    : task.dueDate;
  const end = endOfTimedEvent(start, task.dueDate);
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
        input.googleUserId,
        input.companyId,
        task.googleEventId,
        {
          summary: task.title,
          description,
          start,
          end,
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

    const created = await createGoogleEvent(
      input.googleUserId,
      input.companyId,
      {
        summary: task.title,
        description,
        start,
        end,
      }
    );

    if (!created) {
      // User has no Google connection — keep local only (not an error).
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
  } catch {
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

  await setScheduleSync(item.id, { googleSyncStatus: "SYNCING" });

  try {
    if (item.googleEventId) {
      const updated = await updateGoogleEvent(
        input.userId,
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

    const created = await createGoogleEvent(input.userId, input.companyId, {
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
  } catch {
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

  await setLeadActivitySync(activity.id, { googleSyncStatus: "SYNCING" });

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
    // Only invite client when intentionally a meeting/consultation with them.
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
        input.userId,
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

    const created = await createGoogleEvent(input.userId, input.companyId, {
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
  } catch {
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
