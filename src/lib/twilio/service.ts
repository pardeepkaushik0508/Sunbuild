import "server-only";

import { Role, type SmsMessageStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { sessionHasClientCommunication } from "@/lib/authorization";
import {
  assertLeadAccess,
  assertProjectAccess,
  type AppSession,
} from "@/lib/session";
import { requireTwilioConfig, getTwilioConfig } from "@/lib/twilio/config";
import { sendTwilioSms } from "@/lib/twilio/client";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import { mapTwilioMessageStatus } from "@/lib/twilio/status";
import { phoneMatchTail, toE164 } from "@/lib/twilio/phone";
import { parseTwilioSendError } from "@/lib/twilio/errors";
import type { TwilioFormParams } from "@/lib/twilio/webhook";

export type PublicSmsMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  toNumber: string;
  fromNumber: string | null;
  body: string;
  status: SmsMessageStatus;
  twilioSid: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: Date;
  unverifiedRecipient: boolean;
};

function canSendSms(session: AppSession): boolean {
  if (
    session.membership.role === Role.CLIENT ||
    session.membership.role === Role.SUBCONTRACTOR
  ) {
    return false;
  }
  return sessionHasClientCommunication(session);
}

function toPublic(row: {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  toNumber: string;
  fromNumber: string | null;
  body: string;
  status: SmsMessageStatus;
  twilioSid: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: Date;
}): PublicSmsMessage {
  return {
    id: row.id,
    direction: row.direction,
    toNumber: row.toNumber,
    fromNumber: row.fromNumber,
    body: row.body,
    status: row.status,
    twilioSid: row.twilioSid,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt,
    unverifiedRecipient: parseTwilioSendError({
      code: row.errorCode,
      message: row.errorMessage,
    }).unverifiedRecipient,
  };
}

export async function sendSmsMessage(input: {
  session: AppSession;
  to?: string;
  body: string;
  leadId?: string;
  projectId?: string;
  request?: Request;
}): Promise<PublicSmsMessage> {
  if (!canSendSms(input.session)) {
    throw new ForbiddenError("You do not have permission to send SMS.");
  }

  const body = input.body.trim();
  if (!body) {
    throw new AppError("Message body cannot be empty", 400);
  }
  if (body.length > 1600) {
    throw new AppError("Message is too long (max 1600 characters)", 400);
  }

  let toRaw = input.to?.trim() || "";
  const requestedLeadId = input.leadId?.trim() || null;
  const requestedProjectId = input.projectId?.trim() || null;
  const leadId = requestedLeadId;
  let projectId = requestedProjectId;
  let buyerId: string | null = null;
  const companyId = input.session.membership.companyId;

  if (leadId) {
    await assertLeadAccess(input.session, leadId);
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId },
      select: { phone: true, projectId: true },
    });
    if (!lead) throw new ForbiddenError();
    if (!toRaw && lead.phone) toRaw = lead.phone;
    if (!projectId && lead.projectId) projectId = lead.projectId;
  }

  if (requestedProjectId) {
    await assertProjectAccess(input.session, requestedProjectId);
    const project = await prisma.project.findFirst({
      where: { id: requestedProjectId, companyId },
      select: { buyerId: true, buyer: { select: { phone: true } } },
    });
    if (!project) throw new ForbiddenError();
    buyerId = project.buyerId;
    if (!toRaw && project.buyer?.phone) toRaw = project.buyer.phone;
  }

  const toNumber = toE164(toRaw);
  if (!toNumber) {
    throw new AppError("A valid recipient phone number is required", 400);
  }

  const config = requireTwilioConfig();
  const { status: statusCallback } = getTwilioWebhookUrls(input.request);

  const queued = await prisma.smsMessage.create({
    data: {
      companyId,
      projectId,
      leadId,
      buyerId,
      senderUserId: input.session.user.id,
      direction: "OUTBOUND",
      fromNumber: config.phoneNumber,
      toNumber,
      body,
      status: "QUEUED",
    },
  });

  const sent = await sendTwilioSms(config, {
    to: toNumber,
    body,
    statusCallback,
  });
  const twilioFailed = !sent.sid || sent.status === "failed";
  const mapped = twilioFailed
    ? "FAILED"
    : mapTwilioMessageStatus(sent.status) || "SENT";
  const status = mapped === "RECEIVED" ? "SENT" : mapped;

  const updated = await prisma.smsMessage.update({
    where: { id: queued.id },
    data: {
      twilioSid: sent.sid,
      status,
      fromNumber: sent.from || config.phoneNumber,
      errorCode: sent.errorCode,
      errorMessage: sent.errorMessage,
    },
  });

  await writeAudit({
    userId: input.session.user.id,
    companyId,
    projectId,
    action: twilioFailed ? "sms.send_failed" : "sms.send",
    entityType: "SmsMessage",
    entityId: updated.id,
    metadata: {
      to: toNumber,
      leadId,
      projectId,
      twilioSid: sent.sid,
      errorCode: sent.errorCode,
    },
  });

  if (leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: input.session.user.id,
        type: "SMS",
        title: twilioFailed ? "SMS failed" : "SMS sent",
        content: twilioFailed
          ? sent.errorMessage || "Twilio could not send this SMS"
          : body,
      },
    });
    if (!twilioFailed) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { lastContactAt: new Date() },
      });
    }
  }

  return toPublic(updated);
}

/**
 * Best-effort SMS for in-app notification side effects.
 * Never throws — CRM actions (project/task/RFI/payment/warranty) stay successful.
 */
export async function notifyUserBySmsBestEffort(input: {
  userId: string;
  companyId: string;
  body: string;
  projectId?: string | null;
}): Promise<void> {
  try {
    const config = getTwilioConfig();
    if (!config) return;

    const text = input.body.trim();
    if (!text) return;

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { phone: true },
    });
    const toNumber = user?.phone ? toE164(user.phone) : null;
    if (!toNumber) return;

    const { status: statusCallback } = getTwilioWebhookUrls();
    const queued = await prisma.smsMessage.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId || null,
        senderUserId: null,
        direction: "OUTBOUND",
        fromNumber: config.phoneNumber,
        toNumber,
        body: text.slice(0, 1600),
        status: "QUEUED",
      },
    });

    const sent = await sendTwilioSms(config, {
      to: toNumber,
      body: text.slice(0, 1600),
      statusCallback,
    });
    const twilioFailed = !sent.sid || sent.status === "failed";
    const mapped = twilioFailed
      ? "FAILED"
      : mapTwilioMessageStatus(sent.status) || "SENT";

    await prisma.smsMessage.update({
      where: { id: queued.id },
      data: {
        twilioSid: sent.sid,
        status: mapped === "RECEIVED" ? "SENT" : mapped,
        fromNumber: sent.from || config.phoneNumber,
        errorCode: sent.errorCode,
        errorMessage: sent.errorMessage,
      },
    });
  } catch (err) {
    console.error("[twilio] best-effort SMS did not send", {
      userId: input.userId,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function applyTwilioStatusCallback(
  params: TwilioFormParams
): Promise<void> {
  const sid = params.MessageSid?.trim() || params.SmsSid?.trim();
  if (!sid) return;

  const mapped = mapTwilioMessageStatus(params.MessageStatus || params.SmsStatus);
  const parsed = parseTwilioSendError({
    code: params.ErrorCode,
    message: params.ErrorMessage,
  });

  const existing = await prisma.smsMessage.findUnique({
    where: { twilioSid: sid },
    select: { id: true },
  });
  if (!existing) return;

  await prisma.smsMessage.update({
    where: { id: existing.id },
    data: {
      ...(mapped ? { status: mapped } : {}),
      errorCode: parsed.errorCode || params.ErrorCode?.trim() || null,
      errorMessage: params.ErrorCode || params.ErrorMessage
        ? parsed.errorMessage
        : null,
    },
  });
}

export async function storeInboundSms(params: TwilioFormParams): Promise<void> {
  const sid = params.MessageSid?.trim() || params.SmsSid?.trim();
  const from = params.From?.trim() || "";
  const to = params.To?.trim() || "";
  const body = (params.Body || "").trim();
  const mediaUrl = params.MediaUrl0?.trim() || null;

  if (!from && !sid) return;

  if (sid) {
    const dup = await prisma.smsMessage.findUnique({
      where: { twilioSid: sid },
      select: { id: true },
    });
    if (dup) return;
  }

  const fromE164 = toE164(from) || from;
  const tail = phoneMatchTail(from);
  const matchFilter =
    tail.length >= 7
      ? { phone: { contains: tail } }
      : undefined;

  let lead:
    | { id: string; companyId: string; projectId: string | null }
    | null = null;
  let buyer: { id: string; projects: { id: string; companyId: string }[] } | null =
    null;

  if (matchFilter) {
    lead = await prisma.lead.findFirst({
      where: matchFilter,
      orderBy: { updatedAt: "desc" },
      select: { id: true, companyId: true, projectId: true },
    });
    if (!lead) {
      buyer = await prisma.buyer.findFirst({
        where: matchFilter,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          projects: { select: { id: true, companyId: true }, take: 1 },
        },
      });
    }
  }

  const projectId = lead?.projectId || buyer?.projects[0]?.id || null;
  const companyId = lead?.companyId || buyer?.projects[0]?.companyId || null;

  await prisma.smsMessage.create({
    data: {
      companyId,
      projectId,
      leadId: lead?.id ?? null,
      buyerId: buyer?.id ?? null,
      direction: "INBOUND",
      fromNumber: fromE164,
      toNumber: toE164(to) || to || fromE164,
      body: body || (mediaUrl ? "[media]" : ""),
      mediaUrl,
      status: "RECEIVED",
      twilioSid: sid || null,
    },
  });
}
