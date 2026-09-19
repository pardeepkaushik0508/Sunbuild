import { appAbsoluteUrl, getAppOrigin } from "@/lib/app-url";
import { isPublicHttpOrigin } from "@/lib/twilio/webhooks";

export type NotificationCopyInput = {
  eventType: string;
  projectName?: string | null;
  entityTitle?: string | null;
  href?: string | null;
};

export function publicAbsoluteLink(href?: string | null): string | null {
  if (!href) return null;
  const path = href.startsWith("/") ? href : `/${href}`;
  const origin = getAppOrigin();
  if (!isPublicHttpOrigin(origin)) return null;
  return appAbsoluteUrl(path).href;
}

/** Desired production SMS copy. Trial mode does not send this body to Twilio. */
export function productionSmsBody(input: NotificationCopyInput): string {
  const project = input.projectName || "your project";
  const link = publicAbsoluteLink(input.href);
  const linkPart = link ? ` ${link}` : "";
  switch (input.eventType) {
    case "SELECTION_DUE_TODAY":
      return `SUNBUILD: Your selection for ${project} is due today. Review it in SUNBUILD:${linkPart}`;
    case "INVOICE_OVERDUE":
      return `SUNBUILD: An invoice for ${project} is overdue. Review your payment details in SUNBUILD:${linkPart}`;
    case "DEPOSIT_DUE":
      return `SUNBUILD: A deposit is due for ${project}. Review the deposit in SUNBUILD:${linkPart}`;
    default: {
      const title = input.entityTitle || input.eventType;
      return `SUNBUILD: ${title} — ${project}${linkPart}`;
    }
  }
}

export function productionWhatsAppFreeform(input: NotificationCopyInput): string {
  return productionSmsBody(input);
}
