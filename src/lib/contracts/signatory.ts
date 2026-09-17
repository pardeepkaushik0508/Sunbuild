/**
 * Household authorized-signatory helpers (Master Test Data v2.2 §4.2–4.3).
 * Buyer 1 on the purchase contract is the designated authorized signatory.
 */
export function authorizedSignatoryName(contract: {
  buyerFirstName?: string | null;
  buyerLastName?: string | null;
} | null | undefined): string | null {
  if (!contract) return null;
  const name = [contract.buyerFirstName, contract.buyerLastName]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
}

export function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizePersonName(a) === normalizePersonName(b);
}
