import type { SmsMessageStatus } from "@prisma/client";

/**
 * Map Twilio MessageStatus values onto our Prisma enum.
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
