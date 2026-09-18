import { ChangeOrderStatus, ContractStatus, DepositStatus } from "@prisma/client";
import { depositDisplayLabel } from "@/lib/labels";
import { resolveDueBadge, dueBadgeLabel, type DueBadge } from "@/lib/client/due";

/** Signed / executed COs the household already decided on. */
export function isApprovedChangeOrder(
  status: ChangeOrderStatus | string
): boolean {
  const s = String(status).toUpperCase();
  return s === ChangeOrderStatus.APPROVED || s === ChangeOrderStatus.COMPLETED;
}

export function isDeniedChangeOrder(status: ChangeOrderStatus | string): boolean {
  return String(status).toUpperCase() === ChangeOrderStatus.REJECTED;
}

export function isPendingClientChangeOrder(
  status: ChangeOrderStatus | string
): boolean {
  return String(status).toUpperCase() === ChangeOrderStatus.PENDING_CLIENT;
}

export function clientChangeOrderLabel(status: ChangeOrderStatus | string): string {
  const s = String(status).toUpperCase();
  if (s === ChangeOrderStatus.REJECTED) return "DENIED";
  if (s === ChangeOrderStatus.COMPLETED) return "COMPLETE";
  if (s === ChangeOrderStatus.PENDING_CLIENT) return "AWAITING E-SIGN";
  return s.replace(/_/g, " ");
}

/**
 * Seed descriptions encode "Lines $X + admin $Y + GST $Z = $TOTAL".
 * Prefer that client-facing total (Clause 12) over the stored pre-GST amount.
 */
export function parseChangeOrderClientTotal(
  description: string | null | undefined,
  amount: number
): { total: number; gst: number | null } {
  if (!description) return { total: amount, gst: null };
  const eq = description.match(/=\s*\$([0-9,]+\.\d{2})/);
  const gstMatch = description.match(/GST\s*\$([0-9,]+\.\d{2})/i);
  const gst = gstMatch ? Number(gstMatch[1].replace(/,/g, "")) : null;
  if (eq) {
    return { total: Number(eq[1].replace(/,/g, "")), gst };
  }
  return { total: amount, gst };
}

/**
 * Warranty claim intake is open only after possession / coverage start
 * (Master Test Data v2.2 §19 — 1/2/5/10 year tiers from possession).
 */
export function isWarrantyCoverageActive(input: {
  warrantyStart?: Date | string | null;
  warrantyEnd?: Date | string | null;
  now?: Date;
}): boolean {
  if (!input.warrantyStart) return false;
  const now = input.now ?? new Date();
  const start =
    input.warrantyStart instanceof Date
      ? input.warrantyStart
      : new Date(input.warrantyStart);
  if (Number.isNaN(start.getTime()) || start.getTime() > now.getTime()) {
    return false;
  }
  if (!input.warrantyEnd) return true;
  const end =
    input.warrantyEnd instanceof Date
      ? input.warrantyEnd
      : new Date(input.warrantyEnd);
  return Number.isNaN(end.getTime()) || end.getTime() >= now.getTime();
}

export function depositPaymentBadge(
  status: DepositStatus | string,
  dueDate?: Date | string | null,
  opts?: { isOverdue?: boolean }
): {
  label: string;
  tone: "success" | "warning" | "danger" | "default" | "info";
} {
  const s = String(status).toUpperCase();
  if (s === DepositStatus.RECEIVED || s === "WAIVED") {
    return { label: s === "WAIVED" ? "Waived" : "Received", tone: "success" };
  }
  if (opts?.isOverdue === false) {
    const due: DueBadge = resolveDueBadge(dueDate, { isSettled: false });
    if (due === "DUE_SOON") return { label: "Due soon", tone: "warning" };
    return { label: "Scheduled", tone: "warning" };
  }
  if (s === DepositStatus.OVERDUE || opts?.isOverdue === true) {
    return { label: "Overdue", tone: "danger" };
  }

  const due: DueBadge = resolveDueBadge(dueDate, { isSettled: false });
  if (due === "OVERDUE") return { label: "Overdue", tone: "danger" };
  if (s === DepositStatus.DUE || due === "DUE_NOW") {
    return { label: "Due now", tone: "danger" };
  }
  if (due === "DUE_SOON") return { label: "Due soon", tone: "warning" };
  if (s === DepositStatus.PENDING) {
    return { label: dueBadgeLabel(due) ?? "Scheduled", tone: "warning" };
  }
  return { label: depositDisplayLabel(s), tone: "default" };
}

export function clientContractStatusLabel(status: ContractStatus | string | null | undefined) {
  const s = String(status ?? "").toUpperCase();
  if (s === ContractStatus.IN_REVIEW) return "Contract under review";
  if (s === ContractStatus.EXECUTED || s === ContractStatus.SIGNED) {
    return "Purchase agreement executed";
  }
  if (s === "DRAFT") return "Contract draft";
  return s ? s.replace(/_/g, " ") : null;
}

/** Human-readable portal stage from conditions + contract + project. */
export function clientLifecycleStatusLabel(input: {
  projectStatus: string;
  contractStatus?: string | null;
  openPurchaserConditions: number;
}): string {
  if (input.contractStatus === ContractStatus.IN_REVIEW) {
    return "Contract under review";
  }
  if (input.openPurchaserConditions > 0) {
    return "Conditions period";
  }
  return input.projectStatus.replace(/_/g, " ");
}
