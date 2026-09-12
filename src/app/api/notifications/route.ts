import {
  ChangeOrderStatus,
  InvoiceStatus,
  Priority,
  Role,
  RfiStatus,
  SelectionSectionStatus,
  TaskStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { resolveOwnerCompanies } from "@/lib/dashboard/company-stats";
import { depositOpenStatuses } from "@/lib/insights";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  tone?: "danger" | "warning" | "info";
};

export async function GET() {
  try {
    const session = await requireApiSession();
    const role = session.membership.role;
    const isOwner = role === Role.OWNER;
    const isSales = role === Role.SALES_MANAGER;
    const isSubcontractor = role === Role.SUBCONTRACTOR;
    const isClient = role === Role.CLIENT;
    const isPm =
      role === Role.PROJECT_MANAGER ||
      role === Role.OWNER ||
      role === Role.CEO ||
      role === Role.OPERATIONS_ADMIN;

    const companyIds = isOwner
      ? resolveOwnerCompanies(session).map((c) => c.id)
      : [session.membership.companyId];
    const projectIds = await getAccessibleProjectIds(session);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── Client: mirror "Needs your attention" on the portal ─────────────────
    if (isClient) {
      const [changeOrders, selectionSections, invoices] = await Promise.all([
        prisma.changeOrder.findMany({
          where: {
            projectId: { in: projectIds },
            status: ChangeOrderStatus.PENDING_CLIENT,
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
        prisma.selectionSection.findMany({
          where: {
            package: { projectId: { in: projectIds } },
            status: {
              in: [
                SelectionSectionStatus.DRAFT,
                SelectionSectionStatus.CHANGES_REQUESTED,
              ],
            },
          },
          include: {
            package: {
              select: {
                projectId: true,
                project: { select: { name: true } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 8,
        }),
        prisma.invoice.findMany({
          where: {
            projectId: { in: projectIds },
            status: {
              in: [
                InvoiceStatus.SENT,
                InvoiceStatus.VIEWED,
                InvoiceStatus.OVERDUE,
              ],
            },
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
          take: 8,
        }),
      ]);

      const items: NotificationItem[] = [
        ...changeOrders.map((co) => ({
          id: `co-pending-${co.id}`,
          title: `Change order: ${co.title}`,
          body: `${co.project.name} · Awaiting your decision`,
          href: `/client/change-orders?projectId=${co.projectId}`,
          tone: "danger" as const,
        })),
        ...selectionSections.map((sec) => ({
          id: `selection-${sec.id}`,
          title:
            sec.status === SelectionSectionStatus.CHANGES_REQUESTED
              ? `Selection changes requested: ${sec.name}`
              : `Selection needs your review: ${sec.name}`,
          body: sec.package.project.name,
          href: `/client/selections?projectId=${sec.package.projectId}`,
          tone:
            sec.status === SelectionSectionStatus.CHANGES_REQUESTED
              ? ("warning" as const)
              : ("info" as const),
        })),
        ...invoices.map((inv) => ({
          id: `invoice-${inv.id}`,
          title:
            inv.status === InvoiceStatus.OVERDUE
              ? `Overdue invoice: ${inv.invoiceNumber}`
              : `Invoice due: ${inv.invoiceNumber}`,
          body: inv.project.name,
          href: `/client/invoices?projectId=${inv.projectId}`,
          tone:
            inv.status === InvoiceStatus.OVERDUE
              ? ("danger" as const)
              : ("warning" as const),
        })),
      ];

      return NextResponse.json({ items: items.slice(0, 15) });
    }

    // ── Subcontractor: assigned open tasks ──────────────────────────────────
    if (isSubcontractor) {
      const assignedTasks = await prisma.task.findMany({
        where: {
          assigneeId: session.user.id,
          projectId: { in: projectIds },
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: [{ updatedAt: "desc" }, { dueDate: "asc" }],
        take: 15,
      });

      const items = assignedTasks.map((t) => ({
        id: `assigned-task-${t.id}`,
        title: `Task assigned: ${t.title}`,
        body: t.project.name,
        href: `/sub/jobs/${t.project.id}`,
        tone: "info" as const,
      }));

      return NextResponse.json({ items });
    }

    // ── Staff (PM / Owner / Sales / Bookkeeper / etc.) ──────────────────────
    const [
      tasks,
      rfis,
      deposits,
      overdueFollowUps,
      waitingProposals,
      pendingClientCos,
      recentClientDecisions,
    ] = await Promise.all([
      prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          priority: Priority.HIGH,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { dueDate: "asc" },
        take: 8,
      }),
      prisma.rFI.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      prisma.deposit.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: depositOpenStatuses() },
          dueDate: { lte: now },
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      isOwner || isSales
        ? prisma.lead.findMany({
            where: {
              companyId: { in: companyIds },
              status: { notIn: ["WON", "LOST"] },
              followUpAt: { lt: startOfToday },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              followUpAt: true,
            },
            orderBy: { followUpAt: "asc" },
            take: 6,
          })
        : Promise.resolve([]),
      isOwner || isSales
        ? prisma.proposal.count({
            where: {
              companyId: { in: companyIds },
              status: "SENT",
            },
          })
        : Promise.resolve(0),
      isPm
        ? prisma.changeOrder.findMany({
            where: {
              projectId: { in: projectIds },
              status: ChangeOrderStatus.PENDING_CLIENT,
            },
            include: { project: { select: { id: true, name: true } } },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      isPm
        ? prisma.changeOrder.findMany({
            where: {
              projectId: { in: projectIds },
              status: {
                in: [ChangeOrderStatus.APPROVED, ChangeOrderStatus.REJECTED],
              },
              clientActionAt: { gte: weekAgo },
            },
            include: { project: { select: { id: true, name: true } } },
            orderBy: { clientActionAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
    ]);

    const items: NotificationItem[] = [
      ...overdueFollowUps.map((l) => ({
        id: `lead-followup-${l.id}`,
        title: `Follow-up overdue: ${l.firstName} ${l.lastName}`,
        body: "Lead requires action",
        href: `/sales/leads/${l.id}`,
        tone: "danger" as const,
      })),
      ...(waitingProposals > 0
        ? [
            {
              id: "proposals-waiting",
              title: `${waitingProposals} proposal${waitingProposals === 1 ? "" : "s"} awaiting response`,
              body: "Active proposals",
              href: "/sales/proposals",
              tone: "warning" as const,
            },
          ]
        : []),
      ...pendingClientCos.map((co) => ({
        id: `co-awaiting-${co.id}`,
        title: `Awaiting client: ${co.title}`,
        body: co.project.name,
        href: `/pm/change-orders?projectId=${co.projectId}`,
        tone: "warning" as const,
      })),
      ...recentClientDecisions.map((co) => ({
        id: `co-decided-${co.id}`,
        title:
          co.status === ChangeOrderStatus.APPROVED
            ? `Client approved: ${co.title}`
            : `Client rejected: ${co.title}`,
        body: co.project.name,
        href: `/pm/change-orders?projectId=${co.projectId}`,
        tone:
          co.status === ChangeOrderStatus.APPROVED
            ? ("info" as const)
            : ("danger" as const),
      })),
      ...tasks.map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        body: t.project.name,
        href: isOwner
          ? "/owner/alerts"
          : `/pm/tasks?projectId=${t.project.id}`,
        tone: "danger" as const,
      })),
      ...rfis.map((r) => ({
        id: `rfi-${r.id}`,
        title: r.title,
        body: r.project.name,
        href: `/pm/rfis`,
        tone: "warning" as const,
      })),
      ...deposits.map((d) => ({
        id: `dep-${d.id}`,
        title: d.label || "Deposit due",
        body: d.project?.name ?? "Deposit",
        href: "/bookkeeper/invoices",
        tone: "info" as const,
      })),
    ];

    return NextResponse.json({ items: items.slice(0, 15) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
