/**
 * Temporary MVP visibility: only Sunview Custom Homes is shown in dashboards.
 * Sister brands are not seeded in Master Test Data v2.2 (assertion 26).
 * To re-enable a company later: create the Company row, remove its slug from HIDDEN, set isActive = true.
 */
export const MVP_HIDDEN_COMPANY_SLUGS = new Set([
  "aspen-living",
  "brilliance-homes",
]);

export function isCompanyVisibleInMvp(slug: string): boolean {
  return !MVP_HIDDEN_COMPANY_SLUGS.has(slug);
}
