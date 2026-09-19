import "server-only";

import {
  DepositStatus,
  InvoiceStatus,
  Role,
  RfiStatus,
  SelectionSectionStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotificationOnce } from "@/lib/notifications";
import { computeDepositDue, isDepositSettled } from "@/lib/deposits/due";
import {
  addCalendarDays,
  calendarDateKey,
  getBusinessTimeZone,
  isCalendarDateBeforeToday,
  isCalendarDateInExactlyDays,
  isCalendarDateToday,
  zonedYmd,
} from "@/lib/messaging/timezone";

/**
 * Due-date dispatcher for the approved channel matrix.
 * Idempotent via notification eventKey + CommunicationDelivery idempotencyKey.
 */
export async function dispatchDueNotifications(now = new Date()) {
  const timeZone = getBusinessTimeZone();
  const today = zonedYmd(now, timeZone);
  const in3 = addCalendarDays(today, 3);
  let created = 0;

  const selectionWindow = await prisma.selectionSection.findMany({
    where: {
      clientVisible: true,
      dueDate: { not: null },
      status: {
        in: [SelectionSectionStatus.DRAFT, SelectionSectionStatus.CHANGES_REQUESTED],
      },
    },
    include: {
      package: {
        include: {
          project: {
            select: {
              id: true,
              companyId: true,
              name: true,
              deletedAt: true,
              buyer: { select: { userId: true } },
              access: { where: { role: Role.CLIENT }, select: { userId: true } },
            },
          },
        },
      },
    },
    take: 400,
  });

  for (const section of selectionWindow) {
    const project = section.package.project;
    if (project.deletedAt) continue;
    const dueKey = calendarDateKey(section.dueDate);
    if (!dueKey) continue;
    const isDue3 = isCalendarDateInExactlyDays(section.dueDate, 3, now, timeZone);
    const isDueToday = isCalendarDateToday(section.dueDate, now, timeZone);
    if (!isDue3 && !isDueToday) continue;

    const clients = new Set<string>();
    if (project.buyer?.userId) clients.add(project.buyer.userId);
    for (const a of project.access) clients.add(a.userId);

    const type = isDueToday ? "SELECTION_DUE_TODAY" : "SELECTION_DUE_3_DAYS";
    const title = isDueToday
      ? `Selection due today: ${section.name}`
      : `Selection due in 3 days: ${section.name}`;
    for (const userId of clients) {
      const row = await createNotificationOnce({
        userId,
        companyId: project.companyId,
        type,
        title,
        body: project.name,
        href: `/client/selections/${section.id}`,
        entityType: "SelectionSection",
        entityId: section.id,
        projectId: project.id,
        eventKey: `${type}:${section.id}:${dueKey}:${userId}`,
      });
      if (row) created += 1;
    }
  }

  const overdueRfis = await prisma.rFI.findMany({
    where: {
      dueDate: { not: null },
      status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
    },
    include: {
      project: { select: { id: true, companyId: true, name: true, pmId: true, deletedAt: true } },
    },
    take: 400,
  });
  for (const rfi of overdueRfis) {
    if (rfi.project.deletedAt) continue;
    if (!isCalendarDateBeforeToday(rfi.dueDate, now, timeZone)) continue;
    if (!rfi.project.pmId) continue;
    const row = await createNotificationOnce({
      userId: rfi.project.pmId,
      companyId: rfi.project.companyId,
      type: "RFI_OVERDUE",
      title: `RFI overdue: ${rfi.title}`,
      body: rfi.project.name,
      href: "/pm/rfis",
      entityType: "RFI",
      entityId: rfi.id,
      projectId: rfi.project.id,
      eventKey: `RFI_OVERDUE:${rfi.id}:${today}`,
    });
    if (row) created += 1;
  }

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      dueDate: { not: null },
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE] },
      payeeUserId: null,
    },
    include: {
      project: {
        select: {
          id: true,
          companyId: true,
          name: true,
          deletedAt: true,
          buyer: { select: { userId: true } },
          access: { where: { role: Role.CLIENT }, select: { userId: true } },
        },
      },
    },
    take: 400,
  });
  for (const inv of overdueInvoices) {
    if (inv.project.deletedAt) continue;
    if (!isCalendarDateBeforeToday(inv.dueDate, now, timeZone)) continue;
    const clients = new Set<string>();
    if (inv.project.buyer?.userId) clients.add(inv.project.buyer.userId);
    for (const a of inv.project.access) clients.add(a.userId);
    for (const userId of clients) {
      const row = await createNotificationOnce({
        userId,
        companyId: inv.project.companyId,
        type: "INVOICE_OVERDUE",
        title: `Invoice overdue: ${inv.invoiceNumber}`,
        body: inv.project.name,
        href: "/client/payments",
        entityType: "Invoice",
        entityId: inv.id,
        projectId: inv.project.id,
        eventKey: `INVOICE_OVERDUE:${inv.id}:${userId}`,
      });
      if (row) created += 1;
    }
  }

  const deposits = await prisma.deposit.findMany({
    where: {
      status: { in: [DepositStatus.PENDING, DepositStatus.DUE, DepositStatus.OVERDUE] },
    },
    include: {
      linkedScheduleItem: true,
      project: { select: { id: true, companyId: true, name: true, deletedAt: true } },
    },
    take: 400,
  });
  for (const deposit of deposits) {
    if (!deposit.project || deposit.project.deletedAt) continue;
    if (isDepositSettled(deposit.status)) continue;
    if (!isCalendarDateToday(deposit.dueDate, now, timeZone)) continue;
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
    if (!computed.triggerArmed) continue;
    const bookkeepers = await prisma.membership.findMany({
      where: {
        companyId: deposit.project.companyId,
        isActive: true,
        OR: [
          { role: Role.BOOKKEEPER },
          { role: Role.OPERATIONS_ADMIN, financeAccess: true },
        ],
      },
      select: { userId: true },
    });
    for (const bk of bookkeepers) {
      const row = await createNotificationOnce({
        userId: bk.userId,
        companyId: deposit.project.companyId,
        type: "DEPOSIT_DUE",
        title: `Deposit due: ${deposit.label}`,
        body: deposit.project.name,
        href: "/bookkeeper/invoices",
        entityType: "Deposit",
        entityId: deposit.id,
        projectId: deposit.project.id,
        eventKey: `DEPOSIT_DUE:${deposit.id}:${today}:${bk.userId}`,
      });
      if (row) created += 1;
    }
  }

  const tasksDue = await prisma.task.findMany({
    where: {
      dueDate: { not: null },
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      assigneeId: { not: null },
    },
    include: {
      project: { select: { id: true, companyId: true, name: true, deletedAt: true } },
      assignee: {
        select: {
          id: true,
          memberships: {
            where: { isActive: true },
            select: { role: true, companyId: true },
            take: 4,
          },
        },
      },
    },
    take: 500,
  });
  for (const task of tasksDue) {
    if (task.project.deletedAt) continue;
    if (!isCalendarDateToday(task.dueDate, now, timeZone)) continue;
    if (!task.assigneeId) continue;
    const role = task.assignee?.memberships.find(
      (m) => m.companyId === task.project.companyId
    )?.role;
    const href =
      role === Role.SUBCONTRACTOR
        ? `/sub/jobs/${task.projectId}`
        : `/pm/tasks?projectId=${task.projectId}`;
    const row = await createNotificationOnce({
      userId: task.assigneeId,
      companyId: task.project.companyId,
      type: "TASK_DUE_TODAY",
      title: `Task due today: ${task.title}`,
      body: task.project.name,
      href,
      entityType: "Task",
      entityId: task.id,
      projectId: task.project.id,
      eventKey: `TASK_DUE_TODAY:${task.id}:${today}`,
    });
    if (row) created += 1;
  }

  return { created, today, in3, timeZone };
}
