import "server-only";

import type {
  CommunicationChannel,
  CommunicationDelivery,
  CommunicationDeliveryStatus,
  CommunicationProvider,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapTwilioDeliveryStatus } from "@/lib/twilio/status";
import { parseTwilioSendError } from "@/lib/twilio/errors";
import { shouldRetryDelivery } from "@/lib/messaging/idempotency";
import { maskPhone } from "@/lib/twilio/phone";

export type ClaimDeliveryInput = {
  companyId: string | null;
  recipientUserId?: string | null;
  projectId?: string | null;
  notificationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  eventType: string;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  toNumber: string;
  fromNumber?: string | null;
  contentSid?: string | null;
  messagePreview?: string | null;
  idempotencyKey: string;
  status?: CommunicationDeliveryStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type ClaimResult =
  | { claimed: true; row: CommunicationDelivery }
  | { claimed: false; row: CommunicationDelivery; retry: boolean };

export async function claimDelivery(
  input: ClaimDeliveryInput
): Promise<ClaimResult> {
  try {
    const row = await prisma.communicationDelivery.create({
      data: {
        companyId: input.companyId,
        recipientUserId: input.recipientUserId ?? null,
        projectId: input.projectId ?? null,
        notificationId: input.notificationId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        eventType: input.eventType,
        channel: input.channel,
        provider: input.provider,
        direction: "OUTBOUND",
        toNumber: input.toNumber,
        fromNumber: input.fromNumber ?? null,
        contentSid: input.contentSid ?? null,
        messagePreview: input.messagePreview?.slice(0, 500) ?? null,
        idempotencyKey: input.idempotencyKey,
        status: input.status ?? "PENDING",
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        attemptCount: 1,
      },
    });
    return { claimed: true, row };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : null;
    if (code !== "P2002") throw err;
    const existing = await prisma.communicationDelivery.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!existing) throw err;
    const retry = shouldRetryDelivery({
      status: existing.status,
      attemptCount: existing.attemptCount,
      retryableError: Boolean(
        existing.errorCode &&
          parseTwilioSendError({
            code: existing.errorCode,
            message: existing.errorMessage,
          }).retryable
      ),
    });
    return { claimed: false, row: existing, retry };
  }
}

export async function markDeliverySkipped(
  input: ClaimDeliveryInput & { status: CommunicationDeliveryStatus }
): Promise<CommunicationDelivery> {
  const claimed = await claimDelivery(input);
  if (!claimed.claimed) return claimed.row;
  if (claimed.row.status === input.status) return claimed.row;
  return prisma.communicationDelivery.update({
    where: { id: claimed.row.id },
    data: {
      status: input.status,
      errorCode: input.errorCode ?? claimed.row.errorCode,
      errorMessage: input.errorMessage ?? claimed.row.errorMessage,
      failedAt:
        input.status === "FAILED" ||
        input.status === "INVALID_PHONE" ||
        input.status === "OPTED_OUT"
          ? new Date()
          : claimed.row.failedAt,
    },
  });
}

export async function recordProviderResult(input: {
  deliveryId: string;
  sid: string | null;
  providerStatus: string;
  from?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  optedOut?: boolean;
}): Promise<CommunicationDelivery> {
  const mapped = mapTwilioDeliveryStatus(input.providerStatus);
  let status: CommunicationDeliveryStatus =
    mapped || (input.sid ? "QUEUED" : "FAILED");
  if (input.optedOut) status = "OPTED_OUT";
  if (!input.sid && status !== "OPTED_OUT") status = "FAILED";

  const now = new Date();
  return prisma.communicationDelivery.update({
    where: { id: input.deliveryId },
    data: {
      twilioMessageSid: input.sid,
      fromNumber: input.from ?? undefined,
      status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt:
        status === "SENT" ||
        status === "QUEUED" ||
        status === "ACCEPTED" ||
        status === "SENDING" ||
        status === "DELIVERED" ||
        status === "READ"
          ? now
          : undefined,
      deliveredAt: status === "DELIVERED" || status === "READ" ? now : undefined,
      readAt: status === "READ" ? now : undefined,
      failedAt:
        status === "FAILED" || status === "UNDELIVERED" || status === "OPTED_OUT"
          ? now
          : undefined,
      attemptCount: { increment: 0 },
    },
  });
}

export async function applyDeliveryStatusCallback(input: {
  messageSid: string;
  messageStatus?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<boolean> {
  const existing = await prisma.communicationDelivery.findUnique({
    where: { twilioMessageSid: input.messageSid },
    select: { id: true, status: true },
  });
  if (!existing) return false;

  const mapped = mapTwilioDeliveryStatus(input.messageStatus);
  const parsed = parseTwilioSendError({
    code: input.errorCode,
    message: input.errorMessage,
  });
  let status = mapped || existing.status;
  if (parsed.optedOut) status = "OPTED_OUT";

  const now = new Date();
  await prisma.communicationDelivery.update({
    where: { id: existing.id },
    data: {
      status,
      errorCode: parsed.errorCode || input.errorCode || null,
      errorMessage:
        input.errorCode || input.errorMessage ? parsed.errorMessage : null,
      deliveredAt:
        status === "DELIVERED" || status === "READ" ? now : undefined,
      readAt: status === "READ" ? now : undefined,
      failedAt:
        status === "FAILED" || status === "UNDELIVERED" || status === "OPTED_OUT"
          ? now
          : undefined,
    },
  });
  return true;
}

export async function storeInboundDelivery(input: {
  companyId?: string | null;
  recipientUserId?: string | null;
  projectId?: string | null;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  toNumber: string;
  fromNumber: string;
  twilioMessageSid?: string | null;
  messagePreview?: string | null;
}): Promise<CommunicationDelivery | null> {
  if (input.twilioMessageSid) {
    const dup = await prisma.communicationDelivery.findUnique({
      where: { twilioMessageSid: input.twilioMessageSid },
      select: { id: true },
    });
    if (dup) {
      return prisma.communicationDelivery.findUnique({
        where: { id: dup.id },
      });
    }
  }

  return prisma.communicationDelivery.create({
    data: {
      companyId: input.companyId ?? null,
      recipientUserId: input.recipientUserId ?? null,
      projectId: input.projectId ?? null,
      eventType: "INBOUND",
      channel: input.channel,
      provider: input.provider,
      direction: "INBOUND",
      toNumber: input.toNumber,
      fromNumber: input.fromNumber,
      twilioMessageSid: input.twilioMessageSid ?? null,
      messagePreview: input.messagePreview?.slice(0, 500) ?? null,
      status: "DELIVERED",
    },
  });
}

export function logDeliverySafe(input: {
  eventType: string;
  channel: string;
  recipientUserId?: string | null;
  companyId?: string | null;
  projectId?: string | null;
  to?: string | null;
  sid?: string | null;
  status?: string | null;
  errorCode?: string | null;
}): void {
  console.info("[communication]", {
    eventType: input.eventType,
    channel: input.channel,
    recipientUserId: input.recipientUserId ?? null,
    companyId: input.companyId ?? null,
    projectId: input.projectId ?? null,
    to: maskPhone(input.to),
    messageSid: input.sid ?? null,
    status: input.status ?? null,
    errorCode: input.errorCode ?? null,
  });
}
