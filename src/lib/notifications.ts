import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AppSession } from "@/lib/session";

export type NotificationTone = "danger" | "warning" | "info";

export type NotificationFeedItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  tone?: NotificationTone;
  createdAt?: string;
  read?: boolean;
  /** True for rows stored in the Notification table. */
  persisted?: boolean;
};

export type CreateNotificationInput = {
  userId: string;
  companyId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  tone?: NotificationTone | null;
  entityType?: string | null;
  entityId?: string | null;
};

export function revalidateNotificationInbox() {
  revalidatePath("/notifications");
}

export async function createNotification(input: CreateNotificationInput) {
  if (!input.userId) return null;
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      companyId: input.companyId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      tone: input.tone ?? "info",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
  revalidateNotificationInbox();
  try {
    await smsForNotification(input);
  } catch {
    // SMS must never fail the in-app notification or the CRM action.
  }
  return row;
}

/** Skip if the same unread notification already exists for this user + entity. */
export async function createNotificationOnce(input: CreateNotificationInput) {
  if (!input.userId) return null;
  if (!input.entityId) return createNotification(input);
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      companyId: input.companyId,
      type: input.type,
      entityType: input.entityType ?? undefined,
      entityId: input.entityId,
      readAt: null,
    },
    select: { id: true },
  });
  if (existing) return null;
  return createNotification(input);
}

export async function createNotifications(inputs: CreateNotificationInput[]) {
  const rows = inputs.filter((i) => i.userId);
  if (rows.length === 0) return { count: 0 };
  const result = await prisma.notification.createMany({
    data: rows.map((input) => ({
      userId: input.userId,
      companyId: input.companyId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      tone: input.tone ?? "info",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
  if (result.count > 0) revalidateNotificationInbox();
  for (const input of rows) {
    await smsForNotification(input);
  }
  return result;
}

async function smsForNotification(input: CreateNotificationInput) {
  try {
    const { notifyUserBySmsBestEffort } = await import("@/lib/twilio/service");
    const body = [input.title, input.body].filter(Boolean).join("\n");
    await notifyUserBySmsBestEffort({
      userId: input.userId,
      companyId: input.companyId,
      body,
      projectId: input.entityType === "Project" ? input.entityId : null,
    });
  } catch (err) {
    console.error("[twilio] notification SMS skipped", {
      type: input.type,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function notifyProjectManager(opts: {
  projectId: string;
  companyId: string;
  type: string;
  title: string;
  body?: string | null;
  href: string;
  entityType?: string | null;
  entityId?: string | null;
  excludeUserId?: string;
  once?: boolean;
}) {
  const project = await prisma.project.findFirst({
    where: { id: opts.projectId, companyId: opts.companyId },
    select: { pmId: true, name: true },
  });
  if (!project?.pmId || project.pmId === opts.excludeUserId) return null;
  const payload = {
    userId: project.pmId,
    companyId: opts.companyId,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    href: opts.href,
    entityType: opts.entityType ?? "Project",
    entityId: opts.entityId ?? opts.projectId,
  };
  return opts.once === false
    ? createNotification(payload)
    : createNotificationOnce(payload);
}

/** Notify project PM (and co-PMs via ProjectAccess) about a daily log submission. */
export async function notifyProjectManagersOfDailyLog(opts: {
  projectId: string;
  companyId: string;
  dailyLogId: string;
  authorName: string;
  projectName: string;
  excludeUserId?: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: {
      pmId: true,
      name: true,
      companyId: true,
      access: {
        select: { userId: true, role: true },
      },
    },
  });
  if (!project) return;

  const candidateIds = new Set<string>();
  if (project.pmId) candidateIds.add(project.pmId);
  // Any project access user who also holds a PM membership should be notified
  for (const a of project.access) {
    candidateIds.add(a.userId);
  }

  // Keep only users who actually hold an active Project Manager membership
  // in this company (guards against notifying clients/subs).
  const pmMemberships =
    candidateIds.size === 0
      ? []
      : await prisma.membership.findMany({
          where: {
            companyId: opts.companyId || project.companyId,
            role: Role.PROJECT_MANAGER,
            isActive: true,
            userId: { in: [...candidateIds] },
          },
          select: { userId: true },
        });

  const recipientIds = new Set(pmMemberships.map((m) => m.userId));
  // Always include explicit project.pmId
  if (project.pmId) recipientIds.add(project.pmId);
  if (opts.excludeUserId) recipientIds.delete(opts.excludeUserId);

  if (recipientIds.size === 0) {
    console.warn("[notifications] no PM recipients for daily log", {
      projectId: opts.projectId,
      dailyLogId: opts.dailyLogId,
    });
    return;
  }

  const title = "Daily log submitted";
  const body = `${opts.authorName} · ${opts.projectName || project.name}`;
  const href = `/pm/daily-logs/${opts.dailyLogId}`;
  const companyId = opts.companyId || project.companyId;

  // Route through createNotificationOnce so SMS side-effects and dedupe apply.
  for (const userId of recipientIds) {
    try {
      await createNotificationOnce({
        userId,
        companyId,
        type: "DAILY_LOG_SUBMITTED",
        title,
        body,
        href,
        tone: "info",
        entityType: "DailyLog",
        entityId: opts.dailyLogId,
      });
    } catch (err) {
      console.error("[notifications] failed to create daily log notification", {
        userId,
        dailyLogId: opts.dailyLogId,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
}

export async function listPersistedNotifications(
  session: AppSession,
  opts?: { take?: number; unreadOnly?: boolean }
) {
  const take = opts?.take ?? 50;
  return prisma.notification.findMany({
    where: {
      userId: session.user.id,
      companyId: session.membership.companyId,
      ...(opts?.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function mapPersistedToFeedItem(n: {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  tone: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationFeedItem {
  const tone =
    n.tone === "danger" || n.tone === "warning" || n.tone === "info"
      ? n.tone
      : ("info" as const);
  return {
    id: n.id,
    title: n.title,
    body: n.body ?? "",
    href: n.href || "/notifications",
    tone,
    createdAt: n.createdAt.toISOString(),
    read: Boolean(n.readAt),
    persisted: true,
  };
}

export async function markNotificationRead(
  session: AppSession,
  notificationId: string
) {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId: session.user.id,
      companyId: session.membership.companyId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(session: AppSession) {
  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      companyId: session.membership.companyId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

export async function countUnreadNotifications(session: AppSession) {
  return prisma.notification.count({
    where: {
      userId: session.user.id,
      companyId: session.membership.companyId,
      readAt: null,
    },
  });
}
