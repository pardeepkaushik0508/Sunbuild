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
import { requireTwilioConfig } from "@/lib/twilio/config";
import { sendTwilioSms } from "@/lib/twilio/client";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import { mapTwilioMessageStatus } from "@/lib/twilio/status";
import { inferPhoneRegion, maskPhone, phoneMatchTail, toE164 } from "@/lib/twilio/phone";
import {
  INVALID_RECIPIENT_DIAGNOSTIC,
  parseTwilioSendError,
} from "@/lib/twilio/errors";
import { resolveOutboundTwilioBody, assertTrialFromConfigured } from "@/lib/twilio/payload";
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

/**
 * Resolve the body Twilio receives vs the intended CRM text we store.
 * Trial always sends a whitelist template id; production sends the real text.
 */
export { resolveOutboundTwilioBody };

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
  if (!requestedLeadId && !requestedProjectId) {
    throw new AppError(
      "SMS must be bound to a lead or project. Arbitrary destinations are not allowed.",
      400,
      "SMS_ENTITY_REQUIRED"
    );
  }
  const leadId = requestedLeadId;
  let projectId = requestedProjectId;
  let buyerId: string | null = null;
  const companyId = input.session.membership.companyId;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { province: true },
  });
  const region = inferPhoneRegion({ province: company?.province }) ?? "CA";

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

  const toNumber = toE164(toRaw, { defaultRegion: region });
  if (!toNumber) {
    throw new AppError(INVALID_RECIPIENT_DIAGNOSTIC, 400, "INVALID_RECIPIENT_NUMBER");
  }

  const config = requireTwilioConfig();
  const trialFrom = assertTrialFromConfigured(config);
  if (!trialFrom.ok) {
    throw new AppError(trialFrom.message, 400, trialFrom.code);
  }
  const outbound = resolveOutboundTwilioBody(config, body);
  if (!outbound.ok) {
    throw new AppError(outbound.message, 400, outbound.code);
  }

  const webhooks = getTwilioWebhookUrls(input.request);
  const statusCallback = webhooks.public ? webhooks.smsStatus : undefined;

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
      // Persist intended CRM text even when trial sends a template id to Twilio.
      body: outbound.intendedBody.slice(0, 1600),
      status: "QUEUED",
    },
  });

  const sent = await sendTwilioSms(config, {
    to: toNumber,
    body: outbound.twilioBody,
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
      to: maskPhone(toNumber),
      leadId,
      projectId,
      twilioSid: sent.sid,
      errorCode: sent.errorCode,
      mode: config.mode,
      trialTemplate: outbound.trialTemplate,
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
          : outbound.intendedBody,
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
 * Owner-only trial SMS against an existing company user's phone.
 * Never accepts arbitrary destinations that are not in the directory.
 */
export async function sendTrialSmsToCompanyUser(input: {
  session: AppSession;
  userId: string;
  request?: Request;
}): Promise<{
  success: boolean;
  twilioSid: string | null;
  status: string;
  toDisplay: string;
  trialTemplate: string;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  if (input.session.membership.role !== Role.OWNER) {
    throw new ForbiddenError("Only owners can send trial SMS tests.");
  }

  const config = requireTwilioConfig();
  if (config.mode !== "trial") {
    throw new AppError(
      "Trial SMS test is only available when TWILIO_MODE=trial.",
      400,
      "TWILIO_NOT_TRIAL"
    );
  }

  const trialFrom = assertTrialFromConfigured(config);
  if (!trialFrom.ok) {
    throw new AppError(trialFrom.message, 400, trialFrom.code);
  }

  const outbound = resolveOutboundTwilioBody(
    config,
    "Sunbuild trial SMS diagnostic (intended body retained in history)"
  );
  if (!outbound.ok) {
    throw new AppError(outbound.message, 400, outbound.code);
  }

  const companyId = input.session.membership.companyId;
  const membership = await prisma.membership.findFirst({
    where: {
      companyId,
      userId: input.userId,
    },
    select: {
      user: { select: { id: true, phone: true, name: true } },
    },
  });
  if (!membership?.user) {
    throw new AppError(
      "User not found in this company. Trial test is limited to existing users.",
      404,
      "USER_NOT_FOUND"
    );
  }

  const toNumber = toE164(membership.user.phone || "", { defaultRegion: "CA" });
  if (!toNumber) {
    throw new AppError(INVALID_RECIPIENT_DIAGNOSTIC, 400, "INVALID_RECIPIENT_NUMBER");
  }

  const webhooks = getTwilioWebhookUrls(input.request);
  const statusCallback = webhooks.public ? webhooks.smsStatus : undefined;
  const queued = await prisma.smsMessage.create({
    data: {
      companyId,
      senderUserId: input.session.user.id,
      direction: "OUTBOUND",
      fromNumber: config.phoneNumber,
      toNumber,
      body: outbound.intendedBody,
      status: "QUEUED",
    },
  });

  const sent = await sendTwilioSms(config, {
    to: toNumber,
    body: outbound.twilioBody,
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

  await writeAudit({
    userId: input.session.user.id,
    companyId,
    action: twilioFailed ? "sms.trial_test_failed" : "sms.trial_test",
    entityType: "SmsMessage",
    entityId: queued.id,
    metadata: {
      to: maskPhone(toNumber),
      targetUserId: membership.user.id,
      twilioSid: sent.sid,
      errorCode: sent.errorCode,
      trialTemplate: outbound.trialTemplate,
    },
  });

  return {
    success: !twilioFailed,
    twilioSid: sent.sid,
    status: mapped === "RECEIVED" ? "SENT" : mapped,
    toDisplay: maskPhone(toNumber) || "••••",
    trialTemplate: outbound.trialTemplate || outbound.twilioBody,
    errorCode: sent.errorCode,
    errorMessage: sent.errorMessage,
  };
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
  const { sendTwilioSms } = await import("@/lib/twilio/sms");
  await sendTwilioSms({
    recipientUserId: input.userId,
    companyId: input.companyId,
    body: input.body,
    eventType: "NOTIFICATION",
    projectId: input.projectId,
  });
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

  const { applyDeliveryStatusCallback } = await import(
    "@/lib/messaging/delivery"
  );
  await applyDeliveryStatusCallback({
    messageSid: sid,
    messageStatus: params.MessageStatus || params.SmsStatus,
    errorCode: params.ErrorCode,
    errorMessage: params.ErrorMessage,
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
