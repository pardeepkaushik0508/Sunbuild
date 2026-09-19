import "server-only";

import { prisma } from "@/lib/db";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { AppError } from "@/lib/errors";
import { getWhatsAppInboxStatus } from "@/lib/messaging/provider-select";
import {
  getTwilioWhatsAppConfig,
  isTwilioTrialMode,
} from "@/lib/twilio/config";
import { sendTwilioWhatsAppMessage } from "@/lib/twilio/client";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import {
  inferPhoneRegion,
  normalizeToE164,
} from "@/lib/twilio/phone";
import {
  resolveWhatsAppContentSid,
  trialContentVariables,
} from "@/lib/twilio/whatsapp-templates";
import {
  SANDBOX_NOT_JOINED_DIAGNOSTIC,
  INVALID_RECIPIENT_DIAGNOSTIC,
} from "@/lib/twilio/errors";

export type WhatsAppMessageItem = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  senderName?: string | null;
  senderPhone?: string | null;
  body: string;
  mediaUrl?: string | null;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  whatsappMessageId?: string | null;
  errorMessage?: string | null;
  sentAt: Date;
};

export type WhatsAppConversationSummary = {
  id: string;
  projectId: string;
  projectName: string;
  buyerId?: string | null;
  clientName?: string | null;
  clientPhone: string;
  lastMessageAt?: Date | null;
  lastMessageBody?: string | null;
  unreadCount: number;
};

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export { getWhatsAppInboxStatus };

async function sendStaffMessageViaTwilio(input: {
  toPhone: string;
  body: string;
  companyId: string;
  recipientName?: string | null;
  projectName?: string | null;
}): Promise<{
  sid: string | null;
  status: "SENT" | "FAILED";
  errorMessage: string | null;
}> {
  const wa = getTwilioWhatsAppConfig();
  if (!wa) {
    return {
      sid: null,
      status: "FAILED",
      errorMessage: "Twilio WhatsApp is not configured.",
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { province: true },
  });
  const region = inferPhoneRegion({ province: company?.province }) ?? "CA";
  const normalized = normalizeToE164(input.toPhone, { defaultRegion: region });
  if (!normalized.ok) {
    return {
      sid: null,
      status: "FAILED",
      errorMessage: INVALID_RECIPIENT_DIAGNOSTIC,
    };
  }

  const webhooks = getTwilioWebhookUrls();
  const statusCallback = webhooks.public ? webhooks.whatsappStatus : undefined;

  // Staff chat must send the typed text. Do not substitute a ContentSid
  // template just because the CRM has no inbound session row yet.
  let sent = await sendTwilioWhatsAppMessage(wa, {
    to: normalized.e164,
    body: input.body,
    statusCallback,
  });

  if (
    (!sent.sid || sent.status === "failed") &&
    sent.outsideSessionWindow
  ) {
    const contentSid =
      resolveWhatsAppContentSid({
        eventType: "STAFF_CHAT",
        trial: isTwilioTrialMode(),
        hasCustomerSession: false,
      }).contentSid || wa.testContentSid;
    if (contentSid) {
      sent = await sendTwilioWhatsAppMessage(wa, {
        to: normalized.e164,
        contentSid,
        contentVariables: trialContentVariables({
          recipientName: input.recipientName,
          projectName: input.projectName,
        }),
        statusCallback,
      });
    }
  }

  if (!sent.sid || sent.status === "failed") {
    return {
      sid: sent.sid,
      status: "FAILED",
      errorMessage: sent.sandboxNotJoined
        ? SANDBOX_NOT_JOINED_DIAGNOSTIC
        : sent.errorMessage,
    };
  }

  return {
    sid: sent.sid,
    status: "SENT",
    errorMessage: null,
  };
}

/**
 * Send an outbound staff WhatsApp message (Twilio when configured, else Meta).
 * Always records the message in PostgreSQL; records the provider failure reason.
 */
export async function sendWhatsAppMessage(input: {
  projectId: string;
  toPhone: string;
  body: string;
  senderUserId: string;
  senderName?: string;
}): Promise<WhatsAppMessageItem> {
  const { projectId, toPhone, body, senderUserId, senderName } = input;
  const cleanPhone = normalizePhone(toPhone);
  if (!cleanPhone || cleanPhone.length < 7) {
    throw new AppError("Invalid recipient phone number for WhatsApp", 400);
  }
  if (!body.trim()) {
    throw new AppError("Message body cannot be empty", 400);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { buyer: true },
  });
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  // Find or create conversation for this project + clientPhone
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: {
      projectId_clientPhone: {
        projectId,
        clientPhone: cleanPhone,
      },
    },
  });

  const clientName = project.buyer
    ? `${project.buyer.firstName} ${project.buyer.lastName}`.trim()
    : null;

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        projectId,
        buyerId: project.buyerId,
        clientPhone: cleanPhone,
        clientName,
        lastMessageAt: new Date(),
      },
    });
  }

  const config = getWhatsAppConfig();
  let status: "SENT" | "FAILED" = "SENT";
  let whatsappMessageId: string | null = null;
  let errorMessage: string | null = null;

  const inbox = getWhatsAppInboxStatus();
  if (inbox.provider === "twilio") {
    const sent = await sendStaffMessageViaTwilio({
      toPhone,
      body: body.trim(),
      companyId: project.companyId,
      recipientName: clientName,
      projectName: project.name,
    });
    status = sent.status;
    whatsappMessageId = sent.sid;
    errorMessage = sent.errorMessage;
  } else if (!config) {
    status = "FAILED";
    errorMessage =
      "WhatsApp is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.";
  } else {
    try {
      const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: { preview_url: false, body: body.trim() },
        }),
      });

      const data = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };

      if (!res.ok || !data.messages?.[0]?.id) {
        status = "FAILED";
        errorMessage =
          data.error?.message || `Meta WhatsApp API error (${res.status})`;
      } else {
        whatsappMessageId = data.messages[0].id;
      }
    } catch (err) {
      status = "FAILED";
      errorMessage =
        err instanceof Error ? err.message : "Network error contacting Meta API";
    }
  }

  const msg = await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      senderUserId,
      senderName: senderName || "Project Manager",
      body: body.trim(),
      status,
      whatsappMessageId,
      errorMessage,
      sentAt: new Date(),
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    direction: msg.direction as "OUTBOUND",
    senderName: msg.senderName,
    body: msg.body,
    status: msg.status as "SENT" | "FAILED",
    whatsappMessageId: msg.whatsappMessageId,
    errorMessage: msg.errorMessage,
    sentAt: msg.sentAt,
  };
}

/**
 * Fetch messages for a conversation, ensuring the user has access to the conversation's project.
 */
export async function getConversationMessages(
  conversationId: string,
  accessibleProjectIds: string[]
): Promise<{
  conversation: WhatsAppConversationSummary;
  messages: WhatsAppMessageItem[];
  configured: boolean;
  provider: "twilio" | "meta" | null;
  trialSandbox: boolean;
}> {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!conversation) {
    throw new AppError("Conversation not found", 404);
  }

  if (!accessibleProjectIds.includes(conversation.projectId)) {
    throw new AppError("Access denied to this project conversation", 403);
  }

  const rawMessages = await prisma.whatsAppMessage.findMany({
    where: { conversationId },
    orderBy: { sentAt: "asc" },
    take: 100,
  });

  // Mark inbound as read
  if (conversation.unreadCount > 0) {
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });
  }

  return {
    conversation: {
      id: conversation.id,
      projectId: conversation.projectId,
      projectName: conversation.project.name,
      buyerId: conversation.buyerId,
      clientName: conversation.clientName,
      clientPhone: conversation.clientPhone,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: 0,
    },
    messages: rawMessages.map((m: {
      id: string;
      conversationId: string;
      direction: string;
      senderName: string | null;
      senderPhone: string | null;
      body: string;
      mediaUrl: string | null;
      status: string;
      whatsappMessageId: string | null;
      errorMessage: string | null;
      sentAt: Date;
    }) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction as "INBOUND" | "OUTBOUND",
      senderName: m.senderName,
      senderPhone: m.senderPhone,
      body: m.body,
      mediaUrl: m.mediaUrl,
      status: m.status as "SENT" | "DELIVERED" | "READ" | "FAILED",
      whatsappMessageId: m.whatsappMessageId,
      errorMessage: m.errorMessage,
      sentAt: m.sentAt,
    })),
    ...getWhatsAppInboxStatus(),
  };
}

/**
 * Find or create a conversation for a project and client phone.
 */
export async function getOrCreateProjectConversation(
  projectId: string,
  accessibleProjectIds: string[],
  phone?: string | null
): Promise<string> {
  if (!accessibleProjectIds.includes(projectId)) {
    throw new AppError("Access denied to this project", 403);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { buyer: true },
  });
  if (!project) throw new AppError("Project not found", 404);

  const rawPhone = phone?.trim() || project.buyer?.phone || "";
  const clientPhone = normalizePhone(rawPhone) || `proj_${projectId}`;
  const clientName = project.buyer
    ? `${project.buyer.firstName} ${project.buyer.lastName}`.trim()
    : project.name;

  const conv = await prisma.whatsAppConversation.upsert({
    where: {
      projectId_clientPhone: {
        projectId,
        clientPhone,
      },
    },
    create: {
      projectId,
      buyerId: project.buyerId,
      clientPhone,
      clientName,
      lastMessageAt: new Date(),
    },
    update: {
      clientName,
    },
  });

  return conv.id;
}

/**
 * Process incoming Meta WhatsApp Webhook payloads (messages & statuses).
 */
export async function handleWhatsAppWebhookPayload(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const p = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from: string;
            id: string;
            timestamp: string;
            text?: { body?: string };
            type?: string;
          }>;
          statuses?: Array<{
            id: string;
            status: "delivered" | "read" | "failed" | "sent";
            timestamp: string;
            errors?: Array<{ message?: string }>;
          }>;
          contacts?: Array<{
            profile?: { name?: string };
            wa_id?: string;
          }>;
        };
      }>;
    }>;
  };

  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const val = change.value;
      if (!val) continue;

      // Handle delivery & read status updates
      for (const st of val.statuses ?? []) {
        const statusMap: Record<string, "DELIVERED" | "READ" | "FAILED" | "SENT"> = {
          delivered: "DELIVERED",
          read: "READ",
          failed: "FAILED",
          sent: "SENT",
        };
        const mappedStatus = statusMap[st.status] || "SENT";
        await prisma.whatsAppMessage.updateMany({
          where: { whatsappMessageId: st.id },
          data: {
            status: mappedStatus,
            errorMessage: st.errors?.[0]?.message || null,
          },
        });
      }

      // Handle incoming messages
      for (const msg of val.messages ?? []) {
        if (!msg.from || !msg.text?.body) continue;
        const cleanFrom = normalizePhone(msg.from);
        const contactName = val.contacts?.find(
          (c) => normalizePhone(c.wa_id || "") === cleanFrom
        )?.profile?.name;

        // Try to match a buyer or existing conversation by phone
        let conversation = await prisma.whatsAppConversation.findFirst({
          where: { clientPhone: cleanFrom },
          orderBy: { updatedAt: "desc" },
        });

        if (!conversation) {
          // Look up buyer by phone
          const buyer = await prisma.buyer.findFirst({
            where: {
              phone: {
                contains: cleanFrom.slice(-10),
              },
            },
            include: { projects: { select: { id: true }, take: 1 } },
          });

          if (buyer?.projects?.[0]?.id) {
            conversation = await prisma.whatsAppConversation.create({
              data: {
                projectId: buyer.projects[0].id,
                buyerId: buyer.id,
                clientPhone: cleanFrom,
                clientName: `${buyer.firstName} ${buyer.lastName}`.trim(),
                lastMessageAt: new Date(),
                unreadCount: 1,
              },
            });
          }
        }

        if (conversation) {
          const sentAt = msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000)
            : new Date();

          await prisma.whatsAppMessage.create({
            data: {
              conversationId: conversation.id,
              direction: "INBOUND",
              senderName: contactName || conversation.clientName || cleanFrom,
              senderPhone: cleanFrom,
              body: msg.text.body,
              status: "READ",
              whatsappMessageId: msg.id,
              sentAt,
            },
          });

          await prisma.whatsAppConversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: sentAt,
              unreadCount: { increment: 1 },
            },
          });
        }
      }
    }
  }
}

export type WhatsAppDispatchResult = {
  ok: boolean;
  skipped?: string;
  status?: "SENT" | "FAILED";
  errorMessage?: string | null;
};

/**
 * Best-effort WhatsApp for notification side effects.
 * Recipients come from authorized SUNBUILD user records — never from untrusted input.
 * Failures are recorded and never thrown.
 */
export async function notifyUserByWhatsAppBestEffort(input: {
  userId: string;
  companyId: string;
  body: string;
  projectId?: string | null;
}): Promise<WhatsAppDispatchResult> {
  try {
    const { isAutomatedWhatsAppTwilio } = await import(
      "@/lib/messaging/providers"
    );
    if (isAutomatedWhatsAppTwilio()) {
      const { sendTwilioWhatsApp } = await import("@/lib/twilio/whatsapp");
      await sendTwilioWhatsApp({
        recipientUserId: input.userId,
        companyId: input.companyId,
        body: input.body,
        eventType: "NOTIFICATION",
        projectId: input.projectId,
      });
      return { ok: true };
    }

    const text = input.body.trim();
    if (!text) return { ok: false, skipped: "empty-body" };

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { phone: true, name: true },
    });
    if (!user?.phone?.trim()) {
      return { ok: false, skipped: "missing-phone" };
    }

    const cleanPhone = normalizePhone(user.phone);
    if (!cleanPhone || cleanPhone.length < 7) {
      return { ok: false, skipped: "invalid-phone" };
    }

    const config = getWhatsAppConfig();
    let status: "SENT" | "FAILED" = "SENT";
    let whatsappMessageId: string | null = null;
    let errorMessage: string | null = null;

    if (!config) {
      status = "FAILED";
      errorMessage = "WhatsApp Cloud API is not configured.";
    } else {
      try {
        const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { preview_url: false, body: text.slice(0, 4096) },
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = (await res.json().catch(() => ({}))) as {
          messages?: Array<{ id: string }>;
          error?: { message?: string; code?: number };
        };
        if (!res.ok || !data.messages?.[0]?.id) {
          status = "FAILED";
          errorMessage =
            data.error?.message || `Meta WhatsApp API error (${res.status})`;
        } else {
          whatsappMessageId = data.messages[0].id;
        }
      } catch (err) {
        status = "FAILED";
        errorMessage =
          err instanceof Error ? err.message : "Network error contacting Meta API";
      }
    }

    if (input.projectId) {
      const conversation = await prisma.whatsAppConversation.upsert({
        where: {
          projectId_clientPhone: {
            projectId: input.projectId,
            clientPhone: cleanPhone,
          },
        },
        create: {
          projectId: input.projectId,
          clientPhone: cleanPhone,
          clientName: user.name,
          lastMessageAt: new Date(),
        },
        update: { lastMessageAt: new Date() },
      });
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderName: "SUNBUILD",
          senderUserId: null,
          body: text.slice(0, 4096),
          status,
          whatsappMessageId,
          errorMessage,
          sentAt: new Date(),
        },
      });
    }

    return {
      ok: status === "SENT",
      status,
      errorMessage,
      skipped: status === "FAILED" ? errorMessage ?? "failed" : undefined,
    };
  } catch (err) {
    console.error("[whatsapp] best-effort send skipped", {
      userId: input.userId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      skipped: err instanceof Error ? err.message : "unknown",
    };
  }
}
