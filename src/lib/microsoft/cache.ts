import "server-only";

/**
 * Short-lived per-user Microsoft To Do task cache.
 * Avoids hitting Graph on every dashboard refresh / navigation.
 * Never shares one user's tasks with another.
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 60_000;

export function getMicrosoftCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setMicrosoftCache<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS
): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateMicrosoftCacheForUser(userId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(`${userId}:`)) store.delete(key);
  }
}

export function microsoftTasksCacheKey(
  userId: string,
  companyId: string,
  filter: string
): string {
  return `${userId}:${companyId}:todo:${filter}`;
}
