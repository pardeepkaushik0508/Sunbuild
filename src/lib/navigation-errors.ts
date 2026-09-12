/**
 * Next.js navigation throws (redirect / notFound) must be rethrown from
 * client action wrappers so the router can complete the navigation.
 *
 * Prefer digest prefixes so this stays safe to import from client components
 * without pulling server-only redirect helpers.
 */
export function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest: unknown }).digest) : "";
  // Next 15+: `NEXT_REDIRECT;push;/path;307;` — prefix match is enough.
  return (
    digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")
  );
}
