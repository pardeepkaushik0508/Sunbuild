/**
 * Shared budget utilization — Jobs cards, Budget Overview, reports.
 * MVP: total = Project.purchasePrice; used = paid invoices, else received deposits.
 * Does not fake QuickBooks sync.
 */

export type BudgetSource = {
  purchasePrice: number | null | undefined;
  invoices?: Array<{ amount: number; status: string }>;
  deposits?: Array<{ amount: number; status: string }>;
};

export type BudgetUtilization = {
  used: number;
  total: number;
  percent: number;
  hasBudget: boolean;
};

export function computeBudgetUtilization(
  input: BudgetSource
): BudgetUtilization {
  const total = safeAmount(input.purchasePrice);
  const paidInvoices = (input.invoices ?? [])
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + safeAmount(i.amount), 0);
  const receivedDeposits = (input.deposits ?? [])
    .filter((d) => d.status === "RECEIVED")
    .reduce((sum, d) => sum + safeAmount(d.amount), 0);

  const used =
    paidInvoices > 0 ? paidInvoices : receivedDeposits > 0 ? receivedDeposits : 0;

  if (total <= 0) {
    return { used, total: 0, percent: 0, hasBudget: false };
  }

  return {
    used,
    total,
    percent: clampPercent((used / total) * 100),
    hasBudget: true,
  };
}

function safeAmount(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
