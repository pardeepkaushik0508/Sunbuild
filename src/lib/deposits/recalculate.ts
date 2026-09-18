import "server-only";

import { DepositStatus, DepositTriggerType } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  computeDepositDue,
  dueDatesDiffer,
  isDepositSettled,
} from "@/lib/deposits/due";
import { createNotificationOnce } from "@/lib/notifications";
import { formatIsoDateUtc } from "@/lib/deposits/due";

function formatHumanDate(d: Date | null): string {
  if (!d) return "an updated date";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Recalculate CURRENT due dates for deposits linked to a schedule phase.
 * Baseline/plannedDueDate is never overwritten.
 */
export async function recalculateDepositsForScheduleItem(opts: {
  scheduleItemId: string;
  actorUserId?: string | null;
}): Promise<{ updated: number; notified: number }> {
  const item = await prisma.scheduleItem.findUnique({
    where: { id: opts.scheduleItemId },
    include: {
      project: {
        select: {
          id: true,
          companyId: true,
          buyer: { select: { userId: true } },
          access: {
            where: { role: "CLIENT" },
            select: { userId: true },
          },
        },
      },
      deposits: true,
    },
  });
  if (!item) return { updated: 0, notified: 0 };

  const deposits =
    item.deposits.length > 0
      ? item.deposits
      : await prisma.deposit.findMany({
          where: { linkedScheduleItemId: item.id },
        });

  let updated = 0;
  let notified = 0;

  for (const deposit of deposits) {
    if (isDepositSettled(deposit.status)) continue;
    const computed = computeDepositDue({
      triggerType: deposit.triggerType,
      plannedDueDate: deposit.plannedDueDate ?? deposit.dueDate,
      currentDueDate: deposit.dueDate,
      offsetDays: deposit.offsetDays,
      linkedPhase: {
        title: item.title,
        status: item.status,
        baselineEnd: item.baselineEndDate,
        currentEnd: item.endDate,
        actualEnd: item.actualEndDate,
      },
    });

    const nextStatus = computed.isOverdue
      ? DepositStatus.OVERDUE
      : deposit.status === DepositStatus.OVERDUE && !computed.isOverdue
        ? DepositStatus.PENDING
        : deposit.status;

    const dateChanged = dueDatesDiffer(deposit.dueDate, computed.currentDueDate);
    const statusChanged = nextStatus !== deposit.status;

    if (!dateChanged && !statusChanged) continue;

    const previousDue = deposit.dueDate;
    await prisma.$transaction(async (tx) => {
      await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          dueDate: computed.currentDueDate,
          plannedDueDate: deposit.plannedDueDate ?? deposit.dueDate,
          status: nextStatus,
          dueDateChangeReason: dateChanged ? computed.reason : deposit.dueDateChangeReason,
          lastDueDateChangedAt: dateChanged ? new Date() : deposit.lastDueDateChangedAt,
        },
      });
      if (dateChanged) {
        await tx.depositDueDateHistory.create({
          data: {
            depositId: deposit.id,
            previousDueDate: previousDue,
            newDueDate: computed.currentDueDate,
            reason:
              computed.reason ||
              `Schedule for ${item.title} changed.`,
            linkedScheduleItemId: item.id,
            linkedPhaseName: item.title,
            changedByUserId: opts.actorUserId ?? null,
          },
        });
      }
    });
    updated += 1;

    if (
      dateChanged &&
      deposit.triggerType !== DepositTriggerType.DATE_BASED &&
      computed.currentDueDate
    ) {
      const clientIds = new Set<string>();
      if (item.project.buyer?.userId) clientIds.add(item.project.buyer.userId);
      for (const a of item.project.access) clientIds.add(a.userId);
      const from = formatHumanDate(previousDue);
      const to = formatHumanDate(computed.currentDueDate);
      const eventKey = `DEPOSIT_DUE_DATE_CHANGED:${deposit.id}:${formatIsoDateUtc(computed.currentDueDate)}`;
      for (const userId of clientIds) {
        const row = await createNotificationOnce({
          userId,
          companyId: item.project.companyId,
          type: "DEPOSIT_DUE_DATE_CHANGED",
          title: "Your next deposit date has been updated",
          body: `Your next deposit date has been updated from ${from} to ${to} because the ${item.title} phase schedule changed.`,
          href: "/client/payments",
          tone: "warning",
          entityType: "Deposit",
          entityId: deposit.id,
          eventKey,
        });
        if (row) notified += 1;
      }
    }
  }

  return { updated, notified };
}

export async function refreshDepositOverdueStatus(
  depositId: string,
  now = new Date()
) {
  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
    include: {
      linkedScheduleItem: true,
    },
  });
  if (!deposit || isDepositSettled(deposit.status)) return deposit;
  const computed = computeDepositDue(
    {
      triggerType: deposit.triggerType,
      plannedDueDate: deposit.plannedDueDate ?? deposit.dueDate,
      currentDueDate: deposit.dueDate,
      offsetDays: deposit.offsetDays,
      linkedPhase: deposit.linkedScheduleItem
        ? {
            title: deposit.linkedScheduleItem.title,
            status: deposit.linkedScheduleItem.status,
            baselineEnd: deposit.linkedScheduleItem.baselineEndDate,
            currentEnd: deposit.linkedScheduleItem.endDate,
            actualEnd: deposit.linkedScheduleItem.actualEndDate,
          }
        : null,
    },
    now
  );
  const nextStatus = computed.isOverdue
    ? DepositStatus.OVERDUE
    : deposit.status === DepositStatus.OVERDUE
      ? DepositStatus.PENDING
      : deposit.status;
  if (
    !dueDatesDiffer(deposit.dueDate, computed.currentDueDate) &&
    nextStatus === deposit.status
  ) {
    return deposit;
  }
  return prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      dueDate: computed.currentDueDate,
      status: nextStatus,
    },
  });
}
