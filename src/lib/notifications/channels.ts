export type NotificationCategory =
  | "PROJECT"
  | "FINANCE"
  | "WARRANTY"
  | "TASKS"
  | "GENERAL";

export type NotificationPriority = "NORMAL" | "IMPORTANT" | "URGENT";

export type NotificationChannel = "in_app" | "whatsapp" | "sms";

export type ChannelMatrixEntry = {
  channels: NotificationChannel[];
  category: NotificationCategory;
  priority: NotificationPriority;
};

/**
 * Approved client/internal notification channel matrix (MVP — no email).
 * Unlisted types are in-app only.
 */
export const NOTIFICATION_CHANNEL_MATRIX: Record<string, ChannelMatrixEntry> = {
  SELECTION_DUE_IN_3_DAYS: {
    channels: ["in_app", "whatsapp"],
    category: "PROJECT",
    priority: "IMPORTANT",
  },
  SELECTION_DUE_TODAY: {
    channels: ["in_app", "whatsapp", "sms"],
    category: "PROJECT",
    priority: "URGENT",
  },
  RFI_OVERDUE: {
    channels: ["in_app", "whatsapp"],
    category: "PROJECT",
    priority: "IMPORTANT",
  },
  INVOICE_OVERDUE: {
    channels: ["in_app", "sms"],
    category: "FINANCE",
    priority: "URGENT",
  },
  DEPOSIT_DUE: {
    channels: ["in_app", "sms"],
    category: "FINANCE",
    priority: "IMPORTANT",
  },
  TASK_DUE_TODAY: {
    channels: ["in_app", "whatsapp"],
    category: "TASKS",
    priority: "IMPORTANT",
  },
  DEPOSIT_DUE_DATE_CHANGED: {
    channels: ["in_app"],
    category: "FINANCE",
    priority: "IMPORTANT",
  },
  WARRANTY_TICKET_CREATED: {
    channels: ["in_app"],
    category: "WARRANTY",
    priority: "IMPORTANT",
  },
  WARRANTY_TICKET_ASSIGNED: {
    channels: ["in_app"],
    category: "WARRANTY",
    priority: "IMPORTANT",
  },
  WARRANTY_STATUS_CHANGED: {
    channels: ["in_app"],
    category: "WARRANTY",
    priority: "NORMAL",
  },
  WARRANTY_FORWARDED: {
    channels: ["in_app"],
    category: "WARRANTY",
    priority: "IMPORTANT",
  },
  SUBCONTRACTOR_PROJECT_ASSIGNED: {
    channels: ["in_app", "sms"],
    category: "PROJECT",
    priority: "IMPORTANT",
  },
  TASK_ASSIGNED: {
    channels: ["in_app"],
    category: "TASKS",
    priority: "NORMAL",
  },
};

export function channelsForNotificationType(
  type: string
): ChannelMatrixEntry {
  return (
    NOTIFICATION_CHANNEL_MATRIX[type] ?? {
      channels: ["in_app"],
      category: "GENERAL",
      priority: "NORMAL",
    }
  );
}

export function notificationCategoryFromType(type: string): NotificationCategory {
  return channelsForNotificationType(type).category;
}

export function notificationHrefIsSafe(href: string | null | undefined): boolean {
  if (!href) return true;
  if (!href.startsWith("/")) return false;
  if (href.startsWith("//")) return false;
  if (href.includes("://")) return false;
  return true;
}

export function warrantyTicketHref(
  role: string | null | undefined,
  ticketId: string
): string {
  if (role === "CLIENT") return `/client/warranty/${ticketId}`;
  if (role === "SUBCONTRACTOR") return `/sub/warranty/${ticketId}`;
  if (role === "SERVICE_COORDINATOR") return `/service/warranty/${ticketId}`;
  return `/pm/warranty/${ticketId}`;
}
