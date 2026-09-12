import "server-only";

/**
 * Short-lived per-user Google Calendar event cache.
 * Avoids hitting Google on every month click / poll / dashboard refresh.
 * Never shares one user's calendar data with another.
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 45_000;

export function getGoogleCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setGoogleCache<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS
): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateGoogleCacheForUser(userId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(`${userId}:`)) store.delete(key);
  }
}

export function googleEventsCacheKey(
  userId: string,
  companyId: string,
  timeMinIso: string,
  timeMaxIso: string
): string {
  return `${userId}:${companyId}:events:${timeMinIso}:${timeMaxIso}`;
}
