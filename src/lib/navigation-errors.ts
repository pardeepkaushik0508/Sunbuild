/**
 * Next.js navigation throws (redirect / notFound) must be rethrown from
 * client action wrappers so the router can complete the navigation.
 */
export function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest =
    "digest" in error ? String((error as { digest: unknown }).digest) : "";
  return (
    digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")
  );
}
