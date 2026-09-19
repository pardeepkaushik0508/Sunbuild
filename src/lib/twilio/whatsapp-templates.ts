/**
 * Central WhatsApp Content SID mapping.
 * Business modules must not hard-code HX template SIDs.
 */

export const WHATSAPP_TEMPLATE_KEYS = [
  "SUNBUILD_SELECTION_REMINDER",
  "SUNBUILD_TASK_DUE",
  "SUNBUILD_RFI_OVERDUE",
  "SUNBUILD_SCHEDULE_UPDATE",
  "SUNBUILD_WARRANTY_UPDATE",
  "SUNBUILD_DUE_DATE_CHANGED",
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

const EVENT_TO_TEMPLATE: Record<string, WhatsAppTemplateKey> = {
  SELECTION_DUE_3_DAYS: "SUNBUILD_SELECTION_REMINDER",
  SELECTION_DUE_IN_3_DAYS: "SUNBUILD_SELECTION_REMINDER",
  SELECTION_DUE_TODAY: "SUNBUILD_SELECTION_REMINDER",
  TASK_DUE_TODAY: "SUNBUILD_TASK_DUE",
  RFI_OVERDUE: "SUNBUILD_RFI_OVERDUE",
};

const ENV_BY_TEMPLATE: Record<WhatsAppTemplateKey, string> = {
  SUNBUILD_SELECTION_REMINDER: "TWILIO_WA_TEMPLATE_SELECTION_REMINDER",
  SUNBUILD_TASK_DUE: "TWILIO_WA_TEMPLATE_TASK_DUE",
  SUNBUILD_RFI_OVERDUE: "TWILIO_WA_TEMPLATE_RFI_OVERDUE",
  SUNBUILD_SCHEDULE_UPDATE: "TWILIO_WA_TEMPLATE_SCHEDULE_UPDATE",
  SUNBUILD_WARRANTY_UPDATE: "TWILIO_WA_TEMPLATE_WARRANTY_UPDATE",
  SUNBUILD_DUE_DATE_CHANGED: "TWILIO_WA_TEMPLATE_DUE_DATE_CHANGED",
};

export function templateKeyForEvent(eventType: string): WhatsAppTemplateKey | null {
  return EVENT_TO_TEMPLATE[eventType] ?? null;
}

export function contentSidForTemplate(
  key: WhatsAppTemplateKey | string | null | undefined
): string | null {
  if (!key) return null;
  const envName = ENV_BY_TEMPLATE[key as WhatsAppTemplateKey];
  if (envName) {
    const fromEnv = process.env[envName]?.trim();
    if (fromEnv) return fromEnv;
  }
  return null;
}

export function trialWhatsAppContentSid(): string | null {
  return process.env.TWILIO_WHATSAPP_TEST_CONTENT_SID?.trim() || null;
}

/**
 * Resolve the Content SID for an outbound WhatsApp send.
 * Trial business-initiated messages always use the pre-approved test SID.
 * Production uses mapped approved templates when configured.
 */
export function resolveWhatsAppContentSid(input: {
  eventType: string;
  trial: boolean;
  hasCustomerSession: boolean;
}): { mode: "TEMPLATE" | "FREEFORM_SESSION" | "UNAVAILABLE"; contentSid: string | null } {
  if (input.hasCustomerSession) {
    return { mode: "FREEFORM_SESSION", contentSid: null };
  }
  if (input.trial) {
    const sid = trialWhatsAppContentSid();
    return sid
      ? { mode: "TEMPLATE", contentSid: sid }
      : { mode: "UNAVAILABLE", contentSid: null };
  }
  const key = templateKeyForEvent(input.eventType);
  const sid = contentSidForTemplate(key);
  if (sid) return { mode: "TEMPLATE", contentSid: sid };
  return { mode: "UNAVAILABLE", contentSid: null };
}

export function trialContentVariables(input: {
  recipientName?: string | null;
  projectName?: string | null;
}): Record<string, string> {
  return {
    "1": (input.recipientName || "SUNBUILD").slice(0, 80),
    "2": (input.projectName || "notification").slice(0, 80),
  };
}

export function productionContentVariables(input: {
  recipientName?: string | null;
  projectName?: string | null;
  dueDate?: string | null;
  link?: string | null;
  title?: string | null;
}): Record<string, string> {
  return {
    "1": (input.recipientName || "there").slice(0, 80),
    "2": (input.projectName || "your project").slice(0, 80),
    "3": (input.dueDate || input.title || "soon").slice(0, 80),
    "4": (input.link || "").slice(0, 200),
  };
}
