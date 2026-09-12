import { Priority, Role, RfiStatus, TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { resolveOwnerCompanies } from "@/lib/dashboard/company-stats";
import { depositOpenStatuses } from "@/lib/insights";

export async function GET() {
  try {
    const session = await requireApiSession();
    const role = session.membership.role;
    const isOwner = role === Role.OWNER;
    const isSales = role === Role.SALES_MANAGER;
    const isSubcontractor = role === Role.SUBCONTRACTOR;
    const companyIds = isOwner
      ? resolveOwnerCompanies(session).map((c) => c.id)
      : [session.membership.companyId];
    const projectIds = await getAccessibleProjectIds(session);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Subcontractors: show tasks assigned to them
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

    const [tasks, rfis, deposits, overdueFollowUps, waitingProposals] =
      await Promise.all([
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
      ]);

    const items = [
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

    void companyIds;

    return NextResponse.json({ items: items.slice(0, 15) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
