/**
 * Purchase-contract activation gates (Master Test Data v2.2 §22.3 / §23).
 * SV-1004 must fail both checks and stay blocked until corrected.
 */
import { roundMoney } from "@/lib/contracts/contracts";

export type ContractActivationIssue = {
  code: "DEPOSIT_LADDER" | "POSSESSION_DATE";
  message: string;
};

export type DepositLike = {
  label?: string | null;
  amount: number;
};

const CAD_HOLIDAY_FIXED: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 7, day: 1, name: "Canada Day" },
  { month: 9, day: 30, name: "National Day for Truth and Reconciliation" },
  { month: 12, day: 25, name: "Christmas Day" },
  { month: 12, day: 26, name: "Boxing Day" },
];

/** First Monday of September (Labour Day). */
function labourDay(year: number): Date {
  const d = new Date(Date.UTC(year, 8, 1));
  const dow = d.getUTCDay(); // 0=Sun
  const offset = dow === 1 ? 0 : (8 - dow) % 7;
  return new Date(Date.UTC(year, 8, 1 + offset));
}

/** Observed weekday if holiday falls on weekend (common federal practice for fixed dates). */
function observedDate(year: number, month: number, day: number): Date {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  if (dow === 0) return new Date(Date.UTC(year, month - 1, day + 1));
  if (dow === 6) return new Date(Date.UTC(year, month - 1, day + 2));
  return d;
}

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Canada-wide statutory holidays relevant to possession drafting notes.
 * Uses UTC calendar date of the possession day.
 */
export function canadaWideHolidayName(date: Date): string | null {
  const y = date.getUTCFullYear();
  const key = ymdUTC(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  );

  for (const h of CAD_HOLIDAY_FIXED) {
    if (ymdUTC(observedDate(y, h.month, h.day)) === key) return h.name;
  }
  if (ymdUTC(labourDay(y)) === key) return "Labour Day";
  return null;
}

export function isWeekendUTC(date: Date): boolean {
  const dow = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  ).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Possession must not fall on a weekend or Canada-wide statutory holiday.
 */
export function validatePossessionDate(
  possession: Date | string | null | undefined
): ContractActivationIssue | null {
  if (!possession) {
    return {
      code: "POSSESSION_DATE",
      message: "Firm possession / closing date is required before activation.",
    };
  }
  const d =
    typeof possession === "string" ? new Date(possession) : new Date(possession);
  if (Number.isNaN(d.getTime())) {
    return {
      code: "POSSESSION_DATE",
      message: "Firm possession / closing date is invalid.",
    };
  }
  if (isWeekendUTC(d)) {
    const label = d.toISOString().slice(0, 10);
    return {
      code: "POSSESSION_DATE",
      message: `Possession date ${label} falls on a weekend and must be rejected.`,
    };
  }
  const holiday = canadaWideHolidayName(d);
  if (holiday) {
    const label = d.toISOString().slice(0, 10);
    return {
      code: "POSSESSION_DATE",
      message: `Possession date ${label} is ${holiday} (Canada-wide statutory holiday) and must be rejected.`,
    };
  }
  return null;
}

/**
 * Deposit ladder (all lines including balance on closing) must equal total purchase price.
 * Master Test Data §8 / §23 assertions 4–5 and §22.3 deliberate error 1.
 */
export function validateDepositLadder(input: {
  totalPurchasePrice: number | null | undefined;
  deposits: DepositLike[];
}): ContractActivationIssue | null {
  const total = roundMoney(input.totalPurchasePrice ?? 0);
  if (!(total > 0)) {
    return {
      code: "DEPOSIT_LADDER",
      message: "Total purchase price is required to validate the deposit ladder.",
    };
  }
  if (!input.deposits.length) {
    return {
      code: "DEPOSIT_LADDER",
      message: "Deposit schedule is missing — cannot activate without a reconciled ladder.",
    };
  }
  const sum = roundMoney(
    input.deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  );
  if (Math.abs(sum - total) > 0.009) {
    return {
      code: "DEPOSIT_LADDER",
      message: `Deposit ladder sums to $${sum.toFixed(2)} against a $${total.toFixed(2)} total — must fail validation.`,
    };
  }
  return null;
}

export function validateContractActivation(input: {
  totalPurchasePrice: number | null | undefined;
  deposits: DepositLike[];
  possessionDate: Date | string | null | undefined;
}): ContractActivationIssue[] {
  const issues: ContractActivationIssue[] = [];
  const dep = validateDepositLadder(input);
  if (dep) issues.push(dep);
  const pos = validatePossessionDate(input.possessionDate);
  if (pos) issues.push(pos);
  return issues;
}

export function formatActivationBlockMessage(
  issues: ContractActivationIssue[]
): string {
  if (!issues.length) return "";
  const named = issues.map((i) => i.message).join(" ");
  return `Contract activation blocked. ${named}`;
}
