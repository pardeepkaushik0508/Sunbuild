/** Display copy only — do not change Deposit/Invoice semantics to match labels. */

export const CLIENT_DEPOSIT_LABEL = "Client Deposit";

export function depositDisplayLabel(stored?: string | null) {
  const value = stored?.trim();
  if (!value) return CLIENT_DEPOSIT_LABEL;
  if (/^sales deposit$/i.test(value)) return CLIENT_DEPOSIT_LABEL;
  return value;
}
