import { appAbsoluteUrl, getAppOrigin } from "@/lib/app-url";
import { isPublicHttpOrigin } from "@/lib/twilio/webhooks";
import {
  renderSmsTemplate,
  type SmsTemplateContext,
} from "@/lib/sms/templates";

export type NotificationCopyInput = {
  eventType: string;
  projectName?: string | null;
  entityTitle?: string | null;
  href?: string | null;
  recipientName?: string | null;
  selectionName?: string | null;
  invoiceNumber?: string | null;
  invoiceDueDate?: string | null;
  depositAmount?: string | null;
};

export function publicAbsoluteLink(href?: string | null): string | null {
  if (!href) return null;
  const path = href.startsWith("/") ? href : `/${href}`;
  const origin = getAppOrigin();
  if (!isPublicHttpOrigin(origin)) return null;
  return appAbsoluteUrl(path).href;
}

/**
 * Desired production SMS copy.
 * Trial mode does NOT send this body to Twilio — see resolveOutboundTwilioBody.
 */
export function productionSmsBody(input: NotificationCopyInput): string {
  const context: SmsTemplateContext = {
    recipientName: input.recipientName,
    projectName: input.projectName,
    href: input.href,
    projectUrl: input.href,
    selectionName: input.selectionName || input.entityTitle,
    invoiceNumber: input.invoiceNumber || undefined,
    invoiceDueDate: input.invoiceDueDate,
    depositAmount: input.depositAmount,
    taskName: input.entityTitle,
  };

  const rendered = renderSmsTemplate(input.eventType, context);
  if (rendered.ok) return rendered.body;

  // Safe fallback for unknown events / incomplete template data.
  const project = input.projectName || "your project";
  const link = publicAbsoluteLink(input.href);
  const linkPart = link ? ` ${link}` : "";
  const title = input.entityTitle || input.eventType;
  return `SUNBUILD: ${title} — ${project}${linkPart}`;
}

export function productionWhatsAppFreeform(input: NotificationCopyInput): string {
  return productionSmsBody(input);
}
