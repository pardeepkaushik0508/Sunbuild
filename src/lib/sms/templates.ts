/**
 * Central SUNBUILD SMS template registry.
 *
 * Production copy is rendered here. Trial Twilio requests still use the
 * global TWILIO_TRIAL_TEMPLATE identifier (see resolveOutboundTwilioBody) —
 * never send this custom body through Trial.
 */

import { appAbsoluteUrl, getAppOrigin } from "@/lib/app-url";
import { isPublicHttpOrigin } from "@/lib/twilio/webhooks";
import type { TwilioTrialTemplate } from "@/lib/twilio/mode";
import { channelsForNotificationType } from "@/lib/notifications/channels";

export type SmsTemplateKey =
  | "selection_due_today"
  | "invoice_overdue"
  | "deposit_due"
  | "subcontractor_project_assigned"
  | "project_assigned"
  | "task_assigned"
  | "task_due_today"
  | "rfi_overdue"
  | "selection_due_3_days"
  | "generic";

export type SmsTemplateContext = {
  recipientName?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  selectionName?: string | null;
  selectionDueDate?: string | null;
  invoiceNumber?: string | null;
  invoiceDueDate?: string | null;
  depositDueDate?: string | null;
  depositAmount?: string | null;
  taskName?: string | null;
  taskDueDate?: string | null;
  /** Relative path preferred; absolute public URL also accepted. */
  projectUrl?: string | null;
  href?: string | null;
};

export type SmsTemplateDefinition = {
  key: SmsTemplateKey;
  version: number;
  /** Prefer channels matrix; this mirrors SMS dispatch eligibility. */
  smsEnabled: boolean;
  /** Documented Trial identifier preference (global env still wins for send). */
  trialTemplate: TwilioTrialTemplate;
  /** Env name for optional Twilio Content SID (HX…). */
  contentSidEnv?: string;
  recommendedTwilioName: string;
  renderProduction: (ctx: SmsTemplateContext) => string | null;
};

export type RenderSmsTemplateResult =
  | {
      ok: true;
      body: string;
      templateKey: SmsTemplateKey;
      templateVersion: number;
      smsEnabled: boolean;
      trialTemplate: TwilioTrialTemplate;
      contentSidEnv?: string;
    }
  | {
      ok: false;
      code: "TEMPLATE_DATA_INVALID" | "TEMPLATE_UNKNOWN" | "SMS_DISABLED";
      message: string;
      templateKey?: SmsTemplateKey;
    };

const CONTENT_ENV = {
  SELECTION_DUE_TODAY: "TWILIO_CONTENT_SELECTION_DUE",
  INVOICE_OVERDUE: "TWILIO_CONTENT_INVOICE_OVERDUE",
  DEPOSIT_DUE: "TWILIO_CONTENT_DEPOSIT_DUE",
  SUBCONTRACTOR_PROJECT_ASSIGNED: "TWILIO_CONTENT_PROJECT_ASSIGNED",
  PROJECT_ASSIGNED: "TWILIO_CONTENT_PROJECT_ASSIGNED",
  TASK_ASSIGNED: "TWILIO_CONTENT_TASK_ASSIGNED",
} as const;

function cleanText(value: string | null | undefined, max = 120): string {
  if (value == null) return "";
  return String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function firstName(full: string | null | undefined): string {
  const cleaned = cleanText(full, 80);
  if (!cleaned) return "";
  return cleaned.split(/\s+/)[0] || "";
}

export function smsGreeting(recipientName?: string | null): string {
  const first = firstName(recipientName);
  return first ? `Dear ${first},` : "Hello,";
}

export function publicSmsLink(
  hrefOrUrl?: string | null
): string | null {
  const raw = cleanText(hrefOrUrl, 400);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (!isPublicHttpOrigin(u.origin)) return null;
      return u.toString();
    } catch {
      return null;
    }
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const origin = getAppOrigin();
  if (!isPublicHttpOrigin(origin)) return null;
  return appAbsoluteUrl(path).href;
}

function requireNonEmpty(
  value: string | null | undefined,
  label: string
): string | null {
  const v = cleanText(value, 160);
  return v || null;
}

function withLink(base: string, url: string | null): string {
  if (!url) return base;
  return `${base} ${url}`;
}

function matrixSmsEnabled(eventType: string): boolean {
  return channelsForNotificationType(eventType).channels.includes("sms");
}

export const SMS_TEMPLATES: Record<string, SmsTemplateDefinition> = {
  SELECTION_DUE_TODAY: {
    key: "selection_due_today",
    version: 1,
    smsEnabled: true,
    trialTemplate: "sms_event_notifications",
    contentSidEnv: CONTENT_ENV.SELECTION_DUE_TODAY,
    recommendedTwilioName: "sunbuild_selection_due_today_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project");
      if (!project) return null;
      const selection =
        requireNonEmpty(ctx.selectionName, "selection") || "your selection";
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      const body = withLink(
        `${smsGreeting(ctx.recipientName)} your selection "${selection}" for ${project} is due today. Please review it in SUNBUILD:`,
        url
      );
      return cleanText(body, 480);
    },
  },
  INVOICE_OVERDUE: {
    key: "invoice_overdue",
    version: 1,
    smsEnabled: true,
    trialTemplate: "sms_account_alerts",
    contentSidEnv: CONTENT_ENV.INVOICE_OVERDUE,
    recommendedTwilioName: "sunbuild_invoice_overdue_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project");
      const invoice = requireNonEmpty(ctx.invoiceNumber, "invoice");
      if (!project || !invoice) return null;
      const due = cleanText(ctx.invoiceDueDate, 40);
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      const duePart = due ? `, due ${due},` : "";
      const body = withLink(
        `${smsGreeting(ctx.recipientName)} invoice ${invoice} for ${project}${duePart} is overdue. Please review it in SUNBUILD:`,
        url
      );
      return cleanText(body, 480);
    },
  },
  DEPOSIT_DUE: {
    key: "deposit_due",
    version: 1,
    smsEnabled: true,
    trialTemplate: "sms_internal_alerts",
    contentSidEnv: CONTENT_ENV.DEPOSIT_DUE,
    recommendedTwilioName: "sunbuild_deposit_due_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project");
      if (!project) return null;
      const amount = cleanText(ctx.depositAmount, 40);
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      const body = amount
        ? withLink(
            `${smsGreeting(ctx.recipientName)} the ${amount} deposit for ${project} is due. Review it in SUNBUILD:`,
            url
          )
        : withLink(
            `${smsGreeting(ctx.recipientName)} a deposit for ${project} is now due. Please review the deposit record in SUNBUILD:`,
            url
          );
      return cleanText(body, 480);
    },
  },
  /** Existing approved matrix entry — keep SMS enabled. */
  SUBCONTRACTOR_PROJECT_ASSIGNED: {
    key: "subcontractor_project_assigned",
    version: 1,
    smsEnabled: true,
    trialTemplate: "sms_internal_alerts",
    contentSidEnv: CONTENT_ENV.SUBCONTRACTOR_PROJECT_ASSIGNED,
    recommendedTwilioName: "sunbuild_project_assigned_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project");
      if (!project) return null;
      const address = cleanText(ctx.projectAddress, 80);
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      const addrPart = address ? ` Location: ${address}.` : "";
      const body = withLink(
        `${smsGreeting(ctx.recipientName)} you have been assigned to ${project}.${addrPart} View details in SUNBUILD:`,
        url
      );
      return cleanText(body, 480);
    },
  },
  /** Prepared for future — SMS dispatch disabled under current MVP matrix. */
  PROJECT_ASSIGNED: {
    key: "project_assigned",
    version: 1,
    smsEnabled: false,
    trialTemplate: "sms_internal_alerts",
    contentSidEnv: CONTENT_ENV.PROJECT_ASSIGNED,
    recommendedTwilioName: "sunbuild_project_assigned_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project");
      if (!project) return null;
      const address = cleanText(ctx.projectAddress, 80);
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      const addrPart = address ? ` Project: ${address}.` : "";
      return cleanText(
        withLink(
          `${smsGreeting(ctx.recipientName)} you have been assigned to ${project}.${addrPart} View project details in SUNBUILD:`,
          url
        ),
        480
      );
    },
  },
  TASK_ASSIGNED: {
    key: "task_assigned",
    version: 1,
    smsEnabled: false,
    trialTemplate: "sms_event_notifications",
    contentSidEnv: CONTENT_ENV.TASK_ASSIGNED,
    recommendedTwilioName: "sunbuild_task_assigned_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project") || "your project";
      const task = requireNonEmpty(ctx.taskName, "task");
      if (!task) return null;
      const due = cleanText(ctx.taskDueDate, 40);
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      const duePart = due ? ` Due: ${due}.` : "";
      return cleanText(
        withLink(
          `${smsGreeting(ctx.recipientName)} task "${task}" has been assigned to you for ${project}.${duePart} View:`,
          url
        ),
        480
      );
    },
  },
  /** Defined for completeness — SMS disabled by channel matrix. */
  TASK_DUE_TODAY: {
    key: "task_due_today",
    version: 1,
    smsEnabled: false,
    trialTemplate: "sms_event_notifications",
    recommendedTwilioName: "sunbuild_task_due_today_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project") || "your project";
      const task = requireNonEmpty(ctx.taskName || ctx.selectionName, "task") || "a task";
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      return cleanText(
        withLink(
          `${smsGreeting(ctx.recipientName)} task "${task}" for ${project} is due today. View:`,
          url
        ),
        480
      );
    },
  },
  RFI_OVERDUE: {
    key: "rfi_overdue",
    version: 1,
    smsEnabled: false,
    trialTemplate: "sms_account_alerts",
    recommendedTwilioName: "sunbuild_rfi_overdue_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project") || "your project";
      const title = requireNonEmpty(ctx.taskName || ctx.selectionName, "rfi") || "an RFI";
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      return cleanText(
        withLink(
          `${smsGreeting(ctx.recipientName)} RFI "${title}" for ${project} is overdue. Review it in SUNBUILD:`,
          url
        ),
        480
      );
    },
  },
  SELECTION_DUE_3_DAYS: {
    key: "selection_due_3_days",
    version: 1,
    smsEnabled: false,
    trialTemplate: "sms_event_notifications",
    recommendedTwilioName: "sunbuild_selection_due_3_days_v1",
    renderProduction(ctx) {
      const project = requireNonEmpty(ctx.projectName, "project");
      if (!project) return null;
      const selection =
        requireNonEmpty(ctx.selectionName, "selection") || "your selection";
      const url = publicSmsLink(ctx.projectUrl || ctx.href);
      return cleanText(
        withLink(
          `${smsGreeting(ctx.recipientName)} your selection "${selection}" for ${project} is due in 3 days. Review it in SUNBUILD:`,
          url
        ),
        480
      );
    },
  },
  SELECTION_DUE_IN_3_DAYS: {
    key: "selection_due_3_days",
    version: 1,
    smsEnabled: false,
    trialTemplate: "sms_event_notifications",
    recommendedTwilioName: "sunbuild_selection_due_3_days_v1",
    renderProduction(ctx) {
      return SMS_TEMPLATES.SELECTION_DUE_3_DAYS.renderProduction(ctx);
    },
  },
};

export function getSmsTemplateDefinition(
  eventType: string
): SmsTemplateDefinition | null {
  return SMS_TEMPLATES[eventType] ?? null;
}

export function isSmsTemplateEnabled(eventType: string): boolean {
  const def = getSmsTemplateDefinition(eventType);
  if (def) return def.smsEnabled && matrixSmsEnabled(eventType);
  return matrixSmsEnabled(eventType);
}

export function contentSidForSmsEvent(
  eventType: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const def = getSmsTemplateDefinition(eventType);
  if (!def?.contentSidEnv) return null;
  return env[def.contentSidEnv]?.trim() || null;
}

/**
 * Render the intended production SMS body for an event.
 * Does not send — callers decide Trial vs custom vs ContentSid.
 */
export function renderSmsTemplate(
  eventType: string,
  context: SmsTemplateContext
): RenderSmsTemplateResult {
  const def = getSmsTemplateDefinition(eventType);
  if (!def) {
    const project = cleanText(context.projectName, 120) || "your project";
    const title =
      cleanText(context.selectionName || context.taskName || context.invoiceNumber, 120) ||
      eventType;
    const url = publicSmsLink(context.projectUrl || context.href);
    const body = cleanText(
      withLink(`SUNBUILD: ${title} — ${project}.`, url),
      480
    );
    if (!body || /undefined|null|\[object Object\]/i.test(body)) {
      return {
        ok: false,
        code: "TEMPLATE_DATA_INVALID",
        message: "Generic SMS template produced invalid text.",
      };
    }
    return {
      ok: true,
      body,
      templateKey: "generic",
      templateVersion: 1,
      smsEnabled: matrixSmsEnabled(eventType),
      trialTemplate: "sms_internal_alerts",
    };
  }

  // Registry may prepare templates that the channel matrix keeps SMS-off.
  const enabled = def.smsEnabled && matrixSmsEnabled(eventType);
  const body = def.renderProduction(context);
  if (!body || /undefined|null|\[object Object\]/i.test(body)) {
    return {
      ok: false,
      code: "TEMPLATE_DATA_INVALID",
      message: `SMS template ${def.key} is missing required business data.`,
      templateKey: def.key,
    };
  }

  return {
    ok: true,
    body,
    templateKey: def.key,
    templateVersion: def.version,
    smsEnabled: enabled,
    trialTemplate: def.trialTemplate,
    contentSidEnv: def.contentSidEnv,
  };
}

/** Content Variables for future Twilio Content Templates (numeric keys). */
export function smsContentVariables(
  eventType: string,
  context: SmsTemplateContext
): Record<string, string> {
  const name = firstName(context.recipientName) || "there";
  const project = cleanText(context.projectName, 80) || "your project";
  const url = publicSmsLink(context.projectUrl || context.href) || "";

  switch (eventType) {
    case "SELECTION_DUE_TODAY":
      return {
        "1": name,
        "2": cleanText(context.selectionName, 80) || "selection",
        "3": project,
        "4": url,
      };
    case "INVOICE_OVERDUE":
      return {
        "1": name,
        "2": cleanText(context.invoiceNumber, 40) || "invoice",
        "3": project,
        "4": url,
      };
    case "DEPOSIT_DUE":
      return {
        "1": name,
        "2": project,
        "3": cleanText(context.depositAmount, 40) || "deposit",
        "4": url,
      };
    default:
      return { "1": name, "2": project, "3": url };
  }
}

export type SmsTemplateReportRow = {
  event: string;
  smsEnabled: boolean;
  templateKey: string;
  trialBodyIdentifier: string;
  productionReady: boolean;
  contentSidConfigured: boolean;
  recommendedTwilioName: string;
};

export function listSmsTemplateReport(
  env: NodeJS.ProcessEnv = process.env
): SmsTemplateReportRow[] {
  const events = [
    "SELECTION_DUE_TODAY",
    "INVOICE_OVERDUE",
    "DEPOSIT_DUE",
    "SUBCONTRACTOR_PROJECT_ASSIGNED",
    "PROJECT_ASSIGNED",
    "TASK_ASSIGNED",
    "SELECTION_DUE_3_DAYS",
    "RFI_OVERDUE",
    "TASK_DUE_TODAY",
  ];
  return events.map((event) => {
    const def = getSmsTemplateDefinition(event);
    const enabled = isSmsTemplateEnabled(event);
    return {
      event,
      smsEnabled: enabled,
      templateKey: def?.key ?? "generic",
      trialBodyIdentifier: def?.trialTemplate ?? "sms_internal_alerts",
      productionReady: Boolean(def?.renderProduction),
      contentSidConfigured: Boolean(
        def?.contentSidEnv && env[def.contentSidEnv]?.trim()
      ),
      recommendedTwilioName: def?.recommendedTwilioName ?? "",
    };
  });
}
