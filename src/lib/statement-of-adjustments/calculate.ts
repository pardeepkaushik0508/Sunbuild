import { ChangeOrderStatus, DepositStatus } from "@prisma/client";
import { addCents, fromCents, toCents } from "./money";

/** Statuses that count toward Statement of Adjustments Change Orders. */
export const SOA_APPROVED_CHANGE_ORDER_STATUSES: ChangeOrderStatus[] = [
  ChangeOrderStatus.APPROVED,
  ChangeOrderStatus.COMPLETED,
];

/** Deposits that reduce Cash to Close. */
export const SOA_QUALIFYING_DEPOSIT_STATUSES: DepositStatus[] = [
  DepositStatus.RECEIVED,
];

export type SoaChangeOrderLine = {
  id: string;
  /** Display label e.g. "Change Order #1" */
  label: string;
  title: string;
  amount: number;
  status: ChangeOrderStatus;
  approvedAt: string | null;
};

export type SoaDepositLine = {
  id: string;
  label: string;
  amount: number;
  status: DepositStatus;
  receivedOrDue: string | null;
};

export type SoaCalculationInput = {
  baseHomePrice: number;
  /** GST rate as fraction, e.g. 0.05 */
  gstRate: number;
  /** Positive = promo credit toward COs */
  promoCreditAdjustment: number;
  changeOrders: Array<{
    id: string;
    title: string;
    amount: number;
    status: ChangeOrderStatus;
    createdAt: Date;
    clientActionAt?: Date | null;
  }>;
  deposits: Array<{
    id: string;
    label: string;
    amount: number;
    status: DepositStatus;
    dueDate?: Date | null;
    updatedAt?: Date;
  }>;
};

export type SoaCalculationResult = {
  baseHomePrice: number;
  subtotal: number;
  changeOrders: SoaChangeOrderLine[];
  changeOrdersSubtotal: number;
  promoCreditAdjustment: number;
  changeOrdersTotalWithoutGst: number;
  totalClosingPrice: number;
  gstRate: number;
  gstRatePercent: number;
  totalGst: number;
  totalSalesPrice: number;
  deposits: SoaDepositLine[];
  depositsToDate: number;
  cashToClose: number;
};

/**
 * Authoritative Statement of Adjustments math (integer cents).
 *
 * Base Home Price
 * + Change Orders Total Without GST (approved COs − promo credit)
 * = Total Closing Price
 * + GST
 * = Total Sales Price
 * − Deposits to Date
 * = Cash to Close
 */
export function calculateStatementOfAdjustments(
  input: SoaCalculationInput
): SoaCalculationResult {
  const baseCents = toCents(input.baseHomePrice);
  const subtotalCents = baseCents;

  const approved = input.changeOrders
    .filter((co) => SOA_APPROVED_CHANGE_ORDER_STATUSES.includes(co.status))
    .sort((a, b) => {
      const ta = (a.clientActionAt ?? a.createdAt).getTime();
      const tb = (b.clientActionAt ?? b.createdAt).getTime();
      if (ta !== tb) return ta - tb;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const changeOrderLines: SoaChangeOrderLine[] = approved.map((co, idx) => ({
    id: co.id,
    label: `Change Order #${idx + 1}`,
    title: co.title,
    amount: fromCents(toCents(co.amount)),
    status: co.status,
    approvedAt: (co.clientActionAt ?? co.createdAt).toISOString(),
  }));

  const changeOrdersSubtotalCents = approved.reduce(
    (sum, co) => addCents(sum, toCents(co.amount)),
    0
  );

  const promoCents = toCents(Math.max(0, input.promoCreditAdjustment));
  const changeOrdersTotalWithoutGstCents = addCents(
    changeOrdersSubtotalCents,
    -promoCents
  );

  const totalClosingPriceCents = addCents(
    subtotalCents,
    changeOrdersTotalWithoutGstCents
  );

  const rate = Number.isFinite(input.gstRate) && input.gstRate >= 0
    ? input.gstRate
    : 0.05;
  const totalGstCents = Math.round(totalClosingPriceCents * rate);
  const totalSalesPriceCents = addCents(totalClosingPriceCents, totalGstCents);

  const received = input.deposits.filter((d) =>
    SOA_QUALIFYING_DEPOSIT_STATUSES.includes(d.status)
  );
  const depositLines: SoaDepositLine[] = received.map((d, idx) => ({
    id: d.id,
    label: d.label?.trim() || `Deposit ${idx + 1}`,
    amount: fromCents(toCents(d.amount)),
    status: d.status,
    receivedOrDue: (d.dueDate ?? d.updatedAt)?.toISOString() ?? null,
  }));

  const depositsToDateCents = received.reduce(
    (sum, d) => addCents(sum, toCents(d.amount)),
    0
  );

  const cashToCloseCents = addCents(
    totalSalesPriceCents,
    -depositsToDateCents
  );

  return {
    baseHomePrice: fromCents(baseCents),
    subtotal: fromCents(subtotalCents),
    changeOrders: changeOrderLines,
    changeOrdersSubtotal: fromCents(changeOrdersSubtotalCents),
    promoCreditAdjustment: fromCents(promoCents),
    changeOrdersTotalWithoutGst: fromCents(changeOrdersTotalWithoutGstCents),
    totalClosingPrice: fromCents(totalClosingPriceCents),
    gstRate: rate,
    gstRatePercent: Math.round(rate * 10000) / 100,
    totalGst: fromCents(totalGstCents),
    totalSalesPrice: fromCents(totalSalesPriceCents),
    deposits: depositLines,
    depositsToDate: fromCents(depositsToDateCents),
    cashToClose: fromCents(cashToCloseCents),
  };
}
