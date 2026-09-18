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
import { formatIsoDateUtc } from "@/lib/deposits/due";
import { computeDepositDue, isDepositSettled } from "@/lib/deposits/due";

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number) {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Due-date dispatcher for the approved channel matrix.
 * Idempotent via notification eventKey. Safe to run twice.
 */
export async function dispatchDueNotifications(now = new Date()) {
  const today = startOfUtcDay(now);
  const in3 = addUtcDays(today, 3);
  const tomorrow = addUtcDays(today, 1);
  let created = 0;

  const selectionDue3 = await prisma.selectionSection.findMany({
    where: {
      clientVisible: true,
      dueDate: { gte: in3, lt: addUtcDays(in3, 1) },
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
              buyer: { select: { userId: true } },
              access: { where: { role: Role.CLIENT }, select: { userId: true } },
            },
          },
        },
      },
    },
    take: 200,
  });
  for (const section of selectionDue3) {
    const project = section.package.project;
    const clients = new Set<string>();
    if (project.buyer?.userId) clients.add(project.buyer.userId);
    for (const a of project.access) clients.add(a.userId);
    const dayKey = formatIsoDateUtc(section.dueDate) ?? "unknown";
    for (const userId of clients) {
      const row = await createNotificationOnce({
        userId,
        companyId: project.companyId,
        type: "SELECTION_DUE_IN_3_DAYS",
        title: `Selection due in 3 days: ${section.name}`,
        body: project.name,
        href: `/client/selections/${section.id}`,
        entityType: "SelectionSection",
        entityId: section.id,
        eventKey: `SELECTION_DUE_IN_3_DAYS:${section.id}:${dayKey}:${userId}`,
      });
      if (row) created += 1;
    }
  }

  const selectionDueToday = await prisma.selectionSection.findMany({
    where: {
      clientVisible: true,
      dueDate: { gte: today, lt: tomorrow },
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
              buyer: { select: { userId: true } },
              access: { where: { role: Role.CLIENT }, select: { userId: true } },
            },
          },
        },
      },
    },
    take: 200,
  });
  for (const section of selectionDueToday) {
    const project = section.package.project;
    const clients = new Set<string>();
    if (project.buyer?.userId) clients.add(project.buyer.userId);
    for (const a of project.access) clients.add(a.userId);
    const dayKey = formatIsoDateUtc(section.dueDate) ?? "unknown";
    for (const userId of clients) {
      const row = await createNotificationOnce({
        userId,
        companyId: project.companyId,
        type: "SELECTION_DUE_TODAY",
        title: `Selection due today: ${section.name}`,
        body: project.name,
        href: `/client/selections/${section.id}`,
        entityType: "SelectionSection",
        entityId: section.id,
        eventKey: `SELECTION_DUE_TODAY:${section.id}:${dayKey}:${userId}`,
      });
      if (row) created += 1;
    }
  }

  const overdueRfis = await prisma.rFI.findMany({
    where: {
      dueDate: { lt: today },
      status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
    },
    include: {
      project: { select: { id: true, companyId: true, name: true, pmId: true } },
    },
    take: 200,
  });
  for (const rfi of overdueRfis) {
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
      eventKey: `RFI_OVERDUE:${rfi.id}:${formatIsoDateUtc(today)}`,
    });
    if (row) created += 1;
  }

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      dueDate: { lt: today },
      status: { in: [InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.OVERDUE] },
      payeeUserId: null,
    },
    include: {
      project: {
        select: {
          companyId: true,
          name: true,
          buyer: { select: { userId: true } },
          access: { where: { role: Role.CLIENT }, select: { userId: true } },
        },
      },
    },
    take: 200,
  });
  for (const inv of overdueInvoices) {
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
        eventKey: `INVOICE_OVERDUE:${inv.id}:${userId}`,
      });
      if (row) created += 1;
    }
  }

  const deposits = await prisma.deposit.findMany({
    where: {
      status: { in: [DepositStatus.PENDING, DepositStatus.DUE, DepositStatus.OVERDUE] },
      dueDate: { gte: today, lt: tomorrow },
    },
    include: {
      linkedScheduleItem: true,
      project: { select: { companyId: true, name: true } },
    },
    take: 200,
  });
  for (const deposit of deposits) {
    if (isDepositSettled(deposit.status)) continue;
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
        companyId: deposit.project?.companyId,
        role: Role.BOOKKEEPER,
        isActive: true,
      },
      select: { userId: true },
    });
    for (const bk of bookkeepers) {
      const row = await createNotificationOnce({
        userId: bk.userId,
        companyId: deposit.project?.companyId ?? "",
        type: "DEPOSIT_DUE",
        title: `Deposit due: ${deposit.label}`,
        body: deposit.project?.name ?? "Deposit",
        href: "/bookkeeper/invoices",
        entityType: "Deposit",
        entityId: deposit.id,
        eventKey: `DEPOSIT_DUE:${deposit.id}:${formatIsoDateUtc(today)}:${bk.userId}`,
      });
      if (row) created += 1;
    }
  }

  const tasksDueToday = await prisma.task.findMany({
    where: {
      dueDate: { gte: today, lt: tomorrow },
      status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      assigneeId: { not: null },
    },
    include: {
      project: { select: { companyId: true, name: true } },
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
    take: 300,
  });
  for (const task of tasksDueToday) {
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
      eventKey: `TASK_DUE_TODAY:${task.id}:${formatIsoDateUtc(today)}`,
    });
    if (row) created += 1;
  }

  return { created };
}
