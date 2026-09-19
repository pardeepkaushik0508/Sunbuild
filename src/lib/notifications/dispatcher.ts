import "server-only";

import { createNotificationOnce, type CreateNotificationInput } from "@/lib/notifications";
import { channelsForNotificationType } from "@/lib/notifications/channels";

export type DispatchNotificationInput = {
  eventType: string;
  companyId: string;
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorUserId?: string | null;
  metadata?: {
    userId: string;
    title: string;
    body?: string | null;
    href?: string | null;
    eventKey?: string | null;
    tone?: "danger" | "warning" | "info" | null;
  };
};

/**
 * Central dispatcher. Business modules pass an event; recipients/channels
 * are resolved server-side. Never accepts a destination phone from the browser.
 */
export async function dispatchNotification(input: DispatchNotificationInput) {
  if (!input.metadata?.userId) return null;
  const matrix = channelsForNotificationType(input.eventType);
  const payload: CreateNotificationInput = {
    userId: input.metadata.userId,
    companyId: input.companyId,
    type: input.eventType,
    title: input.metadata.title,
    body: input.metadata.body,
    href: input.metadata.href,
    tone: input.metadata.tone,
    entityType: input.entityType,
    entityId: input.entityId,
    eventKey: input.metadata.eventKey,
    category: matrix.category,
    priority: matrix.priority,
    projectId: input.projectId,
  };
  return createNotificationOnce(payload);
}
