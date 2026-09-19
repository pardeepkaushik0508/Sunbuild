import "server-only";

import { prisma } from "@/lib/db";
import {
  getTwilioWhatsAppConfig,
  isTwilioTrialMode,
  isTwilioWhatsAppConfigured,
} from "@/lib/twilio/config";
import { getWhatsAppProvider } from "@/lib/messaging/providers";
import {
  claimDelivery,
  logDeliverySafe,
  markDeliverySkipped,
  recordProviderResult,
  storeInboundDelivery,
} from "@/lib/messaging/delivery";
import { channelIdempotencyKey } from "@/lib/messaging/idempotency";
import { productionWhatsAppFreeform } from "@/lib/messaging/content";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import {
  inferPhoneRegion,
  maskPhone,
  normalizeToE164,
  stripWhatsAppPrefix,
  type PhoneRegion,
} from "@/lib/twilio/phone";
import { zonedYmd } from "@/lib/messaging/timezone";
import {
  INVALID_RECIPIENT_DIAGNOSTIC,
  SANDBOX_NOT_JOINED_DIAGNOSTIC,
} from "@/lib/twilio/errors";
import {
  productionContentVariables,
  resolveWhatsAppContentSid,
  trialContentVariables,
} from "@/lib/twilio/whatsapp-templates";
import type { TwilioFormParams } from "@/lib/twilio/webhook";

const SESSION_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export type SendEventWhatsAppInput = {
  recipientUserId: string;
  companyId: string;
  projectId?: string | null;
  eventType: string;
  to?: string | null;
  body?: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
  entityType?: string | null;
  entityId?: string | null;
  notificationId?: string | null;
  href?: string | null;
  projectName?: string | null;
  entityTitle?: string | null;
  recipientName?: string | null;
  dueDate?: string | null;
  idempotencyKey?: string;
  occurrence?: string;
  forceFreeform?: boolean;
};

async function regionForCompany(companyId: string): Promise<PhoneRegion | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { province: true },
  });
  return inferPhoneRegion({ province: company?.province }) ?? "CA";
}

export async function hasWhatsAppCustomerSession(e164: string): Promise<boolean> {
  const since = new Date(Date.now() - SESSION_MS);
  const inbound = await prisma.communicationDelivery.findFirst({
    where: {
      channel: "WHATSAPP",
      direction: "INBOUND",
      fromNumber: { in: [e164, `whatsapp:${e164}`] },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(inbound);
}

export async function sendTwilioWhatsApp(
  input: SendEventWhatsAppInput
): Promise<void> {
  const occurrence = input.occurrence || zonedYmd(new Date());
  const idempotencyKey =
    input.idempotencyKey ||
    channelIdempotencyKey({
      eventType: input.eventType,
      entityId: input.entityId || input.notificationId || "none",
      recipientUserId: input.recipientUserId,
      occurrence,
      channel: "WHATSAPP",
    });

  const intended =
    input.body?.trim() ||
    productionWhatsAppFreeform({
      eventType: input.eventType,
      projectName: input.projectName,
      entityTitle: input.entityTitle,
      href: input.href,
    });

  try {
    if (!isTwilioWhatsAppConfigured()) {
      await markDeliverySkipped({
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        projectId: input.projectId,
        notificationId: input.notificationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        channel: "WHATSAPP",
        provider: "TWILIO",
        toNumber: "unknown",
        messagePreview: intended.slice(0, 500),
        idempotencyKey,
        status: "NOT_CONFIGURED",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "Twilio WhatsApp is not configured.",
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
        channel: "WHATSAPP",
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

    const sessionOpen =
      input.forceFreeform === true
        ? true
        : await hasWhatsAppCustomerSession(normalized.e164);
    const resolved = resolveWhatsAppContentSid({
      eventType: input.eventType,
      trial: isTwilioTrialMode(),
      hasCustomerSession: sessionOpen,
    });

    const useTemplate = resolved.mode === "TEMPLATE";
    if (resolved.mode === "UNAVAILABLE" && !sessionOpen) {
      await markDeliverySkipped({
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        projectId: input.projectId,
        notificationId: input.notificationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        channel: "WHATSAPP",
        provider: "TWILIO",
        toNumber: normalized.e164,
        messagePreview: intended.slice(0, 500),
        idempotencyKey,
        status: "NOT_CONFIGURED",
        errorCode: "WHATSAPP_TEMPLATE_UNAVAILABLE",
        errorMessage:
          "No approved WhatsApp template is available for business-initiated send outside a 24-hour session.",
      });
      return;
    }

    const contentSid = input.contentSid || resolved.contentSid || undefined;
    const contentVariables =
      input.contentVariables ||
      (useTemplate
        ? isTwilioTrialMode()
          ? trialContentVariables({
              recipientName: input.recipientName || user?.name,
              projectName: input.projectName,
            })
          : productionContentVariables({
              recipientName: input.recipientName || user?.name,
              projectName: input.projectName,
              dueDate: input.dueDate,
              link: input.href,
              title: input.entityTitle,
            })
        : undefined);

    const claimed = await claimDelivery({
      companyId: input.companyId,
      recipientUserId: input.recipientUserId,
      projectId: input.projectId,
      notificationId: input.notificationId,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      channel: "WHATSAPP",
      provider: "TWILIO",
      toNumber: normalized.e164,
      fromNumber: getTwilioWhatsAppConfig()?.from ?? null,
      contentSid: contentSid ?? null,
      messagePreview: intended.slice(0, 500),
      idempotencyKey,
    });

    if (!claimed.claimed && !claimed.retry) return;
    if (!claimed.claimed && claimed.row.attemptCount >= MAX_ATTEMPTS) return;

    const provider = getWhatsAppProvider();
    if (!provider) {
      await markDeliverySkipped({
        companyId: input.companyId,
        recipientUserId: input.recipientUserId,
        projectId: input.projectId,
        notificationId: input.notificationId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        channel: "WHATSAPP",
        provider: "TWILIO",
        toNumber: normalized.e164,
        messagePreview: intended.slice(0, 500),
        idempotencyKey,
        status: "NOT_CONFIGURED",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "WhatsApp provider is not configured.",
      });
      return;
    }

    const webhooks = getTwilioWebhookUrls();
    const statusCallback = webhooks.public ? webhooks.whatsappStatus : undefined;
    const sent = useTemplate
      ? await provider.sendTemplate({
          to: normalized.e164,
          contentSid,
          contentVariables,
          statusCallback,
        })
      : await provider.sendFreeform({
          to: normalized.e164,
          body: intended.slice(0, 4096),
          statusCallback,
        });

    await recordProviderResult({
      deliveryId: claimed.row.id,
      sid: sent.sid,
      providerStatus: sent.status,
      from: sent.from,
      errorCode: sent.errorCode,
      errorMessage: sent.sandboxNotJoined
        ? SANDBOX_NOT_JOINED_DIAGNOSTIC
        : sent.errorMessage,
      optedOut: sent.optedOut,
    });

    logDeliverySafe({
      eventType: input.eventType,
      channel: "WHATSAPP",
      recipientUserId: input.recipientUserId,
      companyId: input.companyId,
      projectId: input.projectId,
      to: maskPhone(normalized.e164) || undefined,
      sid: sent.sid,
      status: sent.status,
      errorCode: sent.errorCode,
    });
  } catch (err) {
    console.error("[twilio] WhatsApp send did not throw to CRM caller", {
      eventType: input.eventType,
      recipientUserId: input.recipientUserId,
      companyId: input.companyId,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function matchInboundWhatsAppUser(fromE164: string): Promise<{
  userId: string;
  companyId: string | null;
  projectId: string | null;
} | null> {
  const tail = fromE164.replace(/\D/g, "").slice(-10);
  if (tail.length < 7) return null;

  const users = await prisma.user.findMany({
    where: { phone: { contains: tail }, deletedAt: null },
    select: {
      id: true,
      memberships: {
        where: { isActive: true },
        select: { companyId: true, role: true },
        take: 4,
      },
      projectAccess: {
        select: { projectId: true, role: true },
        take: 8,
      },
    },
    take: 5,
  });

  if (users.length !== 1) return null;
  const user = users[0];
  const companies = new Set(user.memberships.map((m) => m.companyId));
  const companyId = companies.size === 1 ? [...companies][0] : null;
  const clientProjects = user.projectAccess.filter((a) => a.role === "CLIENT");
  const projectId =
    clientProjects.length === 1
      ? clientProjects[0].projectId
      : user.projectAccess.length === 1
        ? user.projectAccess[0].projectId
        : null;
  return { userId: user.id, companyId, projectId };
}

export async function storeInboundWhatsApp(
  params: TwilioFormParams
): Promise<void> {
  const sid = params.MessageSid?.trim() || params.SmsSid?.trim() || null;
  const from = stripWhatsAppPrefix(params.From || "");
  const to = stripWhatsAppPrefix(params.To || "");
  const body = (params.Body || "").trim();
  if (!from && !sid) return;

  const fromNorm = normalizeToE164(from);
  const fromE164 = fromNorm.ok ? fromNorm.e164 : from;
  const toNorm = normalizeToE164(to);
  const toE164 = toNorm.ok ? toNorm.e164 : to;

  const matched = fromNorm.ok
    ? await matchInboundWhatsAppUser(fromNorm.e164)
    : null;

  await storeInboundDelivery({
    companyId: matched?.companyId ?? null,
    recipientUserId: matched?.userId ?? null,
    projectId: matched?.projectId ?? null,
    channel: "WHATSAPP",
    provider: "TWILIO",
    toNumber: toE164 || "unknown",
    fromNumber: fromE164 || "unknown",
    twilioMessageSid: sid,
    messagePreview: body.slice(0, 500) || null,
  });

  if (matched?.projectId && fromE164) {
    const conversation = await prisma.whatsAppConversation.upsert({
      where: {
        projectId_clientPhone: {
          projectId: matched.projectId,
          clientPhone: fromE164.replace(/\D/g, ""),
        },
      },
      create: {
        projectId: matched.projectId,
        clientPhone: fromE164.replace(/\D/g, ""),
        lastMessageAt: new Date(),
        unreadCount: 1,
      },
      update: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        senderPhone: fromE164,
        body: body || "[empty]",
        status: "DELIVERED",
        whatsappMessageId: sid,
        sentAt: new Date(),
      },
    });
  }
}
