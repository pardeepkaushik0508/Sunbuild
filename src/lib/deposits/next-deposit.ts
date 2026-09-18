import { DepositStatus } from "@prisma/client";
import { computeDepositDue, isDepositSettled, type DepositDueComputation } from "@/lib/deposits/due";

export type NextDepositSource = {
  id: string;
  label: string;
  amount: number;
  status: DepositStatus | string;
  dueDate?: Date | string | null;
  plannedDueDate?: Date | string | null;
  triggerType?: string | null;
  offsetDays?: number | null;
  linkedScheduleItem?: {
    id: string;
    title: string;
    status: string;
    baselineEndDate?: Date | string | null;
    endDate?: Date | string | null;
    actualEndDate?: Date | string | null;
  } | null;
};

export type NextDepositView = {
  id: string;
  label: string;
  amount: number;
  status: string;
  plannedDueDate: Date | null;
  currentDueDate: Date | null;
  linkedPhaseName: string | null;
  isOverdue: boolean;
  triggerArmed: boolean;
  changeReason: string | null;
  computation: DepositDueComputation;
};

const OPEN: string[] = [
  DepositStatus.PENDING,
  DepositStatus.DUE,
  DepositStatus.OVERDUE,
];

export function pickNextDeposit(
  deposits: NextDepositSource[],
  now = new Date()
): NextDepositView | null {
  const open = deposits.filter((d) => {
    if (isDepositSettled(d.status)) return false;
    return OPEN.includes(String(d.status).toUpperCase()) || !isDepositSettled(d.status);
  });

  const ranked = open
    .map((d) => {
      const computation = computeDepositDue(
        {
          triggerType: d.triggerType,
          plannedDueDate: d.plannedDueDate ?? d.dueDate,
          currentDueDate: d.dueDate,
          offsetDays: d.offsetDays,
          linkedPhase: d.linkedScheduleItem
            ? {
                title: d.linkedScheduleItem.title,
                status: d.linkedScheduleItem.status,
                baselineEnd: d.linkedScheduleItem.baselineEndDate,
                currentEnd: d.linkedScheduleItem.endDate,
                actualEnd: d.linkedScheduleItem.actualEndDate,
              }
            : null,
        },
        now
      );
      return { d, computation };
    })
    .sort((a, b) => {
      const at = a.computation.currentDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bt = b.computation.currentDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return at - bt;
    });

  const next = ranked[0];
  if (!next) return null;
  return {
    id: next.d.id,
    label: next.d.label,
    amount: next.d.amount,
    status: String(next.d.status),
    plannedDueDate: next.computation.plannedDueDate,
    currentDueDate: next.computation.currentDueDate,
    linkedPhaseName: next.computation.linkedPhaseName,
    isOverdue: next.computation.isOverdue,
    triggerArmed: next.computation.triggerArmed,
    changeReason: next.computation.reason,
    computation: next.computation,
  };
}

export function formatClientDueDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
