/**
 * Shared budget utilization — Jobs cards, Budget Overview, reports.
 * total = Project.purchasePrice + approved change-order amounts;
 * used = paid invoices, else received deposits.
 * Does not fake QuickBooks sync.
 */

export type ApprovedChangeOrderLine = {
  title: string;
  amount: number;
};

export type BudgetSource = {
  purchasePrice: number | null | undefined;
  /** Approved change orders — each amount is added to project total cost. */
  approvedChangeOrders?: ApprovedChangeOrderLine[];
  /** Convenience when only the sum is available (e.g. groupBy). */
  approvedChangeOrderTotal?: number | null;
  invoices?: Array<{ amount: number; status: string }>;
  deposits?: Array<{ amount: number; status: string }>;
};

export type BudgetUtilization = {
  used: number;
  total: number;
  baseTotal: number;
  changeOrderTotal: number;
  changeOrders: ApprovedChangeOrderLine[];
  percent: number;
  hasBudget: boolean;
};

export function sumApprovedChangeOrders(
  lines: ApprovedChangeOrderLine[] | null | undefined
) {
  return (lines ?? []).reduce((sum, line) => sum + safeAmount(line.amount), 0);
}

export function computeBudgetUtilization(
  input: BudgetSource
): BudgetUtilization {
  const changeOrders = (input.approvedChangeOrders ?? [])
    .map((line) => ({
      title: line.title.trim() || "Change order",
      amount: safeAmount(line.amount),
    }))
    .filter((line) => line.amount > 0);

  const changeOrderTotal =
    changeOrders.length > 0
      ? sumApprovedChangeOrders(changeOrders)
      : safeAmount(input.approvedChangeOrderTotal);

  const baseTotal = safeAmount(input.purchasePrice);
  const total = baseTotal + changeOrderTotal;

  const paidInvoices = (input.invoices ?? [])
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + safeAmount(i.amount), 0);
  const receivedDeposits = (input.deposits ?? [])
    .filter((d) => d.status === "RECEIVED")
    .reduce((sum, d) => sum + safeAmount(d.amount), 0);

  const used =
    paidInvoices > 0 ? paidInvoices : receivedDeposits > 0 ? receivedDeposits : 0;

  if (total <= 0) {
    return {
      used,
      total: 0,
      baseTotal,
      changeOrderTotal,
      changeOrders,
      percent: 0,
      hasBudget: false,
    };
  }

  return {
    used,
    total,
    baseTotal,
    changeOrderTotal,
    changeOrders,
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
