import "server-only";

import { prisma } from "@/lib/db";
import {
  getTwilioConfig,
  isTwilioSmsConfigured,
} from "@/lib/twilio/config";
import { getSmsProvider } from "@/lib/messaging/providers";
import {
  claimDelivery,
  logDeliverySafe,
  markDeliverySkipped,
  recordProviderResult,
} from "@/lib/messaging/delivery";
import { channelIdempotencyKey } from "@/lib/messaging/idempotency";
import { productionSmsBody } from "@/lib/messaging/content";
import { resolveSmsTemplateContext } from "@/lib/sms/context";
import { renderSmsTemplate } from "@/lib/sms/templates";
import { resolveSmsProviderOutbound } from "@/lib/sms/resolve-outbound";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import {
  inferPhoneRegion,
  maskPhone,
  normalizeToE164,
  type PhoneRegion,
} from "@/lib/twilio/phone";
import { zonedYmd } from "@/lib/messaging/timezone";
import {
  INVALID_RECIPIENT_DIAGNOSTIC,
  TRIAL_RECIPIENT_NOT_PERMITTED_DIAGNOSTIC,
} from "@/lib/twilio/errors";

const MAX_ATTEMPTS = 3;

export type SendEventSmsInput = {
  recipientUserId: string;
  companyId: string;
  projectId?: string | null;
  eventType: string;
  to?: string | null;
  body?: string;
  entityType?: string | null;
  entityId?: string | null;
  notificationId?: string | null;
  href?: string | null;
  projectName?: string | null;
  entityTitle?: string | null;
  idempotencyKey?: string;
  occurrence?: string;
};

async function regionForCompany(companyId: string): Promise<PhoneRegion | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { province: true },
  });
  return inferPhoneRegion({ province: company?.province }) ?? "CA";
}

export async function sendTwilioSms(input: SendEventSmsInput): Promise<void> {
  const occurrence = input.occurrence || zonedYmd(new Date());
  const idempotencyKey =
    input.idempotencyKey ||
    channelIdempotencyKey({
      eventType: input.eventType,
      entityId: input.entityId || input.notificationId || "none",
      recipientUserId: input.recipientUserId,
      occurrence,
      channel: "SMS",
    });

  const context = await resolveSmsTemplateContext({
    recipientUserId: input.recipientUserId,
    companyId: input.companyId,
    projectId: input.projectId,
    entityType: input.entityType,
    entityId: input.entityId,
    href: input.href,
    fallbackProjectName: input.projectName,
    fallbackEntityTitle: input.entityTitle,
  });

  const rendered = renderSmsTemplate(input.eventType, context);
  let intended: string;
  if (rendered.ok) {
    intended = rendered.body;
  } else if (rendered.code === "TEMPLATE_DATA_INVALID") {
    await markDeliverySkipped({
      companyId: input.companyId,
      recipientUserId: input.recipientUserId,
      projectId: input.projectId,
      notificationId: input.notificationId,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      channel: "SMS",
      provider: "TWILIO",
      toNumber: "unknown",
      messagePreview: (input.body || "").slice(0, 500),
      idempotencyKey,
      status: "FAILED",
      errorCode: "TEMPLATE_DATA_INVALID",
      errorMessage: rendered.message,
    });
    return;
  } else {
    intended =
      input.body?.trim() ||
      productionSmsBody({
        eventType: input.eventType,
        projectName: context.projectName || input.projectName,
        entityTitle: input.entityTitle,
        href: input.href,
        recipientName: context.recipientName,
      });
  }

  try {
    if (!isTwilioSmsConfigured()) {
      await markDeliverySkipped({
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        projectId: input.projectId,
        notificationId: input.notificationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        channel: "SMS",
        provider: "TWILIO",
        toNumber: "unknown",
        messagePreview: intended.slice(0, 500),
        idempotencyKey,
        status: "NOT_CONFIGURED",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "Twilio SMS is not configured.",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: input.recipientUserId },
      select: { phone: true, name: true },
    });
    const rawPhone = input.to?.trim() || user?.phone || "";
    const region = await regionForCompany(input.companyId);
    const normalized = normalizeToE164(rawPhone, { defaultRegion: region });
    if (!normalized.ok) {
      await markDeliverySkipped({
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        projectId: input.projectId,
        notificationId: input.notificationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        channel: "SMS",
        provider: "TWILIO",
        toNumber: rawPhone.slice(0, 32) || "invalid",
        messagePreview: intended.slice(0, 500),
        idempotencyKey,
        status: normalized.reason === "EMPTY" ? "SKIPPED" : "INVALID_PHONE",
        errorCode: normalized.reason,
        errorMessage: INVALID_RECIPIENT_DIAGNOSTIC,
      });
      return;
    }

    const config = getTwilioConfig();
    const outbound = resolveSmsProviderOutbound({
      intendedBody: intended,
      eventType: input.eventType,
      context,
      twilioMode: config?.mode ?? "trial",
    });

    if (!outbound.ok) {
      await markDeliverySkipped({
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        projectId: input.projectId,
        notificationId: input.notificationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        channel: "SMS",
        provider: "TWILIO",
        toNumber: normalized.e164,
        messagePreview: intended.slice(0, 500),
        idempotencyKey,
        status: "FAILED",
        errorCode: outbound.code,
        errorMessage: outbound.message,
      });
      return;
    }

    const claimed = await claimDelivery({
      companyId: input.companyId,
      recipientUserId: input.recipientUserId,
      projectId: input.projectId,
      notificationId: input.notificationId,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      channel: "SMS",
      provider: "TWILIO",
      toNumber: normalized.e164,
      fromNumber: config?.phoneNumber ?? null,
      contentSid: outbound.contentSid,
      messagePreview: outbound.intendedBody.slice(0, 500),
      idempotencyKey,
    });

    if (!claimed.claimed && !claimed.retry) {
      return;
    }
    if (!claimed.claimed && claimed.row.attemptCount >= MAX_ATTEMPTS) {
      return;
    }

    const provider = getSmsProvider();
    if (!provider) {
      await markDeliverySkipped({
        ...claimed.row,
        idempotencyKey,
        status: "NOT_CONFIGURED",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "Twilio SMS is not configured.",
      });
      return;
    }

    const webhooks = getTwilioWebhookUrls();
    const statusCallback = webhooks.public ? webhooks.smsStatus : undefined;
    const sent = outbound.contentSid
      ? await provider.send({
          to: normalized.e164,
          contentSid: outbound.contentSid,
          contentVariables: outbound.contentVariables || undefined,
          statusCallback,
        })
      : await provider.send({
          to: normalized.e164,
          body: outbound.twilioBody || "",
          statusCallback,
        });

    await recordProviderResult({
      deliveryId: claimed.row.id,
      sid: sent.sid,
      providerStatus: sent.status,
      from: sent.from,
      errorCode: sent.optedOut
        ? sent.errorCode
        : sent.unverifiedRecipient
          ? sent.errorCode || "TRIAL_UNVERIFIED"
          : sent.errorCode,
      errorMessage: sent.unverifiedRecipient
        ? TRIAL_RECIPIENT_NOT_PERMITTED_DIAGNOSTIC
        : sent.errorMessage,
      optedOut: sent.optedOut,
    });

    logDeliverySafe({
      eventType: input.eventType,
      channel: "SMS",
      recipientUserId: input.recipientUserId,
      companyId: input.companyId,
      projectId: input.projectId,
      to: maskPhone(normalized.e164) || undefined,
      sid: sent.sid,
      status: sent.status,
      errorCode: sent.errorCode,
    });
  } catch (err) {
    console.error("[twilio] SMS send did not throw to CRM caller", {
      eventType: input.eventType,
      recipientUserId: input.recipientUserId,
      companyId: input.companyId,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}
