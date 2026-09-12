/**
 * Temporary MVP visibility: only Sunview Custom Homes is shown in dashboards.
 * Aspen Living / Brilliance Homes remain in the database and seed for later rollout.
 * To re-enable a company: remove its slug from HIDDEN and set Company.isActive = true.
 */
export const MVP_HIDDEN_COMPANY_SLUGS = new Set([
  "aspen-living",
  "brilliance-homes",
]);

export function isCompanyVisibleInMvp(slug: string): boolean {
  return !MVP_HIDDEN_COMPANY_SLUGS.has(slug);
}
