/** Display copy only — do not change Deposit/Invoice semantics to match labels. */

export const CLIENT_DEPOSIT_LABEL = "Next Deposit";
export const LOT_PLAN_LABEL = "Lot / plan number";
export const EMPTY_FIELD_LABEL = "Not set";

export function depositDisplayLabel(stored?: string | null) {
  const value = stored?.trim();
  if (!value) return CLIENT_DEPOSIT_LABEL;
  if (/^sales deposit$/i.test(value)) return CLIENT_DEPOSIT_LABEL;
  if (/^further deposit/i.test(value)) return CLIENT_DEPOSIT_LABEL;
  return value;
}

export function displayOrUnset(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY_FIELD_LABEL;
}
