import { DepositStatus, DepositTriggerType, ScheduleStatus } from "@prisma/client";

export type DepositTriggerInput = {
  triggerType: DepositTriggerType | string | null | undefined;
  plannedDueDate?: Date | string | null;
  currentDueDate?: Date | string | null;
  offsetDays?: number | null;
  linkedPhase?: {
    title?: string | null;
    status?: string | null;
    baselineEnd?: Date | string | null;
    currentEnd?: Date | string | null;
    actualEnd?: Date | string | null;
  } | null;
};

export type DepositDueComputation = {
  plannedDueDate: Date | null;
  currentDueDate: Date | null;
  phaseComplete: boolean;
  triggerArmed: boolean;
  isOverdue: boolean;
  reason: string | null;
  linkedPhaseName: string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isPhaseComplete(status?: string | null): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === ScheduleStatus.COMPLETED || s === "DONE";
}

export function isDepositSettled(status?: string | null): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === DepositStatus.RECEIVED || s === DepositStatus.WAIVED;
}

export function isDepositCancelled(status?: string | null): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === DepositStatus.WAIVED;
}

function phaseCompletionDate(phase: DepositTriggerInput["linkedPhase"]): Date | null {
  if (!phase) return null;
  if (isPhaseComplete(phase.status)) {
    return toDate(phase.actualEnd) ?? toDate(phase.currentEnd);
  }
  return toDate(phase.currentEnd);
}

/**
 * Recalculate the CURRENT due date from the trigger rule.
 * Never mutates plannedDueDate / baseline.
 */
export function computeDepositDue(input: DepositTriggerInput, now = new Date()): DepositDueComputation {
  const trigger = String(input.triggerType || DepositTriggerType.DATE_BASED);
  const planned = toDate(input.plannedDueDate) ?? toDate(input.currentDueDate);
  const offset = Number.isFinite(input.offsetDays) ? Number(input.offsetDays) : 0;
  const phaseName = input.linkedPhase?.title?.trim() || null;
  const phaseComplete = isPhaseComplete(input.linkedPhase?.status);

  if (
    trigger === DepositTriggerType.DATE_BASED ||
    !input.linkedPhase
  ) {
    const current = toDate(input.currentDueDate) ?? planned;
    const overdue =
      Boolean(current) && utcDay(current!) < utcDay(now);
    return {
      plannedDueDate: planned,
      currentDueDate: current,
      phaseComplete,
      triggerArmed: true,
      isOverdue: overdue,
      reason: null,
      linkedPhaseName: phaseName,
    };
  }

  const completion = phaseCompletionDate(input.linkedPhase);
  const derived = completion ? addUtcDays(completion, offset) : null;
  const current = derived ?? toDate(input.currentDueDate) ?? planned;
  const triggerArmed = phaseComplete;

  // Phase-triggered deposits are never overdue while the prerequisite is incomplete.
  const overdue =
    triggerArmed && Boolean(current) && utcDay(current!) < utcDay(now);

  let reason: string | null = null;
  if (derived && planned && utcDay(derived) !== utcDay(planned)) {
    reason = phaseName
      ? `Your deposit date was updated because the ${phaseName} phase completion has moved.`
      : "Your deposit date was updated because a linked phase schedule changed.";
  }

  return {
    plannedDueDate: planned,
    currentDueDate: current,
    phaseComplete,
    triggerArmed,
    isOverdue: overdue,
    reason,
    linkedPhaseName: phaseName,
  };
}

export function dueDatesDiffer(
  a?: Date | string | null,
  b?: Date | string | null
): boolean {
  const da = toDate(a);
  const db = toDate(b);
  if (!da && !db) return false;
  if (!da || !db) return true;
  return utcDay(da) !== utcDay(db);
}

export function formatIsoDateUtc(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
