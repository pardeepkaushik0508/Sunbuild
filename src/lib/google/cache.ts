/**
 * Short-lived per-user Google Calendar / Tasks cache.
 * Avoids hitting Google on every month click / poll / dashboard refresh.
 * Never shares one user's calendar data with another.
 *
 * No server-only import so unit tests can verify invalidation behavior.
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 45_000;
/** Failures / scope-missing must not linger across reconnect. */
const ERROR_TTL_MS = 5_000;

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

export function getGoogleErrorCacheTtlMs(): number {
  return ERROR_TTL_MS;
}

/**
 * Drop every cache entry belonging to this user.
 * Keys historically used either `${userId}:…` or `gcal-tasks:${userId}:…`.
 */
export function invalidateGoogleCacheForUser(userId: string): void {
  for (const key of store.keys()) {
    if (
      key.startsWith(`${userId}:`) ||
      key.startsWith(`gcal-tasks:${userId}:`) ||
      key.includes(`:${userId}:`)
    ) {
      store.delete(key);
    }
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

export function googleTasksCacheKey(
  userId: string,
  companyId: string,
  timeMinIso: string,
  timeMaxIso: string
): string {
  // Same userId: prefix as events so invalidateGoogleCacheForUser clears both.
  return `${userId}:${companyId}:tasks:${timeMinIso}:${timeMaxIso}`;
}

/** Test helper — clear all entries. */
export function clearGoogleCacheForTests(): void {
  store.clear();
}
