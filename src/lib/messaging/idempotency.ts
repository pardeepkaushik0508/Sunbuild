export function channelIdempotencyKey(input: {
  eventType: string;
  entityId: string;
  recipientUserId: string;
  occurrence: string;
  channel: "SMS" | "WHATSAPP";
}): string {
  return [
    input.eventType,
    input.entityId,
    input.recipientUserId,
    input.occurrence,
    input.channel,
  ].join(":");
}

const RETRYABLE_STATUSES = new Set(["FAILED", "UNDELIVERED", "PENDING", "QUEUED"]);
const PERMANENT_STATUSES = new Set([
  "INVALID_PHONE",
  "OPTED_OUT",
  "NOT_CONFIGURED",
  "SKIPPED",
  "DELIVERED",
  "READ",
  "SENT",
]);

export function shouldRetryDelivery(input: {
  status: string;
  attemptCount: number;
  retryableError?: boolean;
  maxAttempts?: number;
}): boolean {
  const max = input.maxAttempts ?? 3;
  if (input.attemptCount >= max) return false;
  if (PERMANENT_STATUSES.has(input.status) && input.status !== "FAILED") {
    return false;
  }
  if (!RETRYABLE_STATUSES.has(input.status)) return false;
  return Boolean(input.retryableError);
}
