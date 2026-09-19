import type { CommunicationDeliveryStatus } from "@prisma/client";
import type { SmsMessageStatus } from "@prisma/client";

/**
 * Map Twilio MessageStatus values onto CommunicationDelivery statuses.
 */
export function mapTwilioDeliveryStatus(
  raw: string | null | undefined
): CommunicationDeliveryStatus | null {
  const status = (raw || "").trim().toLowerCase();
  switch (status) {
    case "queued":
      return "QUEUED";
    case "accepted":
      return "ACCEPTED";
    case "scheduled":
      return "QUEUED";
    case "sending":
      return "SENDING";
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "undelivered":
      return "UNDELIVERED";
    case "failed":
    case "canceled":
    case "cancelled":
      return "FAILED";
    default:
      return null;
  }
}

/**
 * Map Twilio MessageStatus values onto our Prisma SMS inbox enum.
 * Unknown values stay at the previous stored status (caller should no-op).
 */
export function mapTwilioMessageStatus(
  raw: string | null | undefined
): SmsMessageStatus | null {
  const status = (raw || "").trim().toLowerCase();
  switch (status) {
    case "queued":
    case "accepted":
    case "scheduled":
    case "sending":
      return "QUEUED";
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "DELIVERED";
    case "undelivered":
      return "UNDELIVERED";
    case "failed":
    case "canceled":
    case "cancelled":
      return "FAILED";
    case "received":
    case "receiving":
      return "RECEIVED";
    default:
      return null;
  }
}

export function isTerminalDeliveryStatus(
  status: CommunicationDeliveryStatus
): boolean {
  return (
    status === "DELIVERED" ||
    status === "READ" ||
    status === "FAILED" ||
    status === "UNDELIVERED" ||
    status === "INVALID_PHONE" ||
    status === "SKIPPED" ||
    status === "NOT_CONFIGURED" ||
    status === "OPTED_OUT"
  );
}

export function isPermanentDeliveryStatus(
  status: CommunicationDeliveryStatus
): boolean {
  return (
    status === "INVALID_PHONE" ||
    status === "OPTED_OUT" ||
    status === "NOT_CONFIGURED" ||
    status === "SKIPPED"
  );
}
