/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-process MVP; replace with Redis in multi-instance production.
 */

import { RateLimitError } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_KEYS = 10_000;

function pruneIfNeeded() {
  if (buckets.size < MAX_KEYS) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_KEYS) {
    // Drop oldest half if still full
    let i = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++i > MAX_KEYS / 2) break;
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterMs: number } {
  pruneIfNeeded();
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true };
}

export function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number
) {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.ok) {
    throw new RateLimitError();
  }
}

/** Auth endpoints: stricter limits. */
export const AUTH_RATE = { limit: 10, windowMs: 15 * 60 * 1000 };
/** Upload / expensive mutations. */
export const UPLOAD_RATE = { limit: 30, windowMs: 60 * 1000 };
/** General mutations. */
export const ACTION_RATE = { limit: 120, windowMs: 60 * 1000 };

export function clientKeyFromHeaders(
  headersList: Headers,
  suffix: string
): string {
  const forwarded = headersList.get("x-forwarded-for");
  const ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    headersList.get("x-real-ip") ||
    "unknown";
  return `${ip}:${suffix}`;
}
