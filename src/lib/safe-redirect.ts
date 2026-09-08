/**
 * Prevent open redirects after login / invite flows.
 * Only same-origin relative paths are allowed.
 */

export function safeInternalPath(
  candidate: string | null | undefined,
  fallback = "/"
): string {
  if (!candidate) return fallback;
  const value = candidate.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  if (value.includes("\\")) return fallback;
  // Block protocol-relative and encoded tricks
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("://")) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
