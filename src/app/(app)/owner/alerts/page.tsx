import Link from "next/link";
import {
  DepositStatus,
  Priority,
  RfiStatus,
  Role,
  TaskStatus,
} from "@prisma/client";
import { OwnerTabs } from "@/components/owner/owner-tabs";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatCurrency } from "@/lib/utils";
import { resolveOwnerCompanies } from "@/lib/dashboard/company-stats";

export default async function OwnerAlertsPage() {
  const session = await requireRole(Role.OWNER);
  const companyIds = resolveOwnerCompanies(session).map((c) => c.id);
  const now = new Date();

  const [highPriorityTasks, openRfis, overdueDeposits] = await Promise.all([
    prisma.task.findMany({
      where: {
        priority: { in: [Priority.HIGH, Priority.MEDIUM] },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        project: { companyId: { in: companyIds } },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [
        { priority: "desc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
      take: 40,
    }),
    prisma.rFI.findMany({
      where: {
        status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
        project: { companyId: { in: companyIds } },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    }),
    prisma.deposit.findMany({
      where: {
        project: { companyId: { in: companyIds } },
        OR: [
          { status: DepositStatus.OVERDUE },
          {
            status: { in: [DepositStatus.PENDING, DepositStatus.DUE] },
            dueDate: { lt: now },
          },
        ],
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
  ]);

  const hasAlerts =
    highPriorityTasks.length > 0 ||
    openRfis.length > 0 ||
    overdueDeposits.length > 0;

  return (
    <div className="space-y-5">
      <OwnerTabs />
      <PageHeader
        title="Internal Alerts"
        description="High-priority tasks, open RFIs, and deposits needing attention"
      />

      {!hasAlerts ? (
        <EmptyState
          title="All clear"
          description="No high-priority tasks, open RFIs, or overdue deposits right now."
        />
      ) : null}

      {highPriorityTasks.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-sb-ink">
            High priority tasks
          </h2>
          <DataTable headers={["Task", "Project", "Priority", "Status", "Due"]}>
            {highPriorityTasks.map((task) => (
              <tr key={task.id}>
                <Td>
                  <Link
                    href={`/pm/tasks?projectId=${task.project.id}`}
                    className="font-medium text-sb-ink hover:underline"
                  >
                    {task.title}
                  </Link>
                </Td>
                <Td>
                  <Link
                    href={`/pm/projects/${task.project.id}`}
                    className="text-sb-ink hover:underline"
                  >
                    {task.project.name}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge tone={statusTone(task.priority)}>
                    {task.priority}
                  </StatusBadge>
                </Td>
                <Td>
                  <StatusBadge tone={statusTone(task.status)}>
                    {task.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Td>
                <Td>{formatDate(task.dueDate)}</Td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}

      {openRfis.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-sb-ink">Open RFIs</h2>
          <DataTable headers={["RFI", "Project", "Priority", "Due"]}>
            {openRfis.map((rfi) => (
              <tr key={rfi.id}>
                <Td>{rfi.title}</Td>
                <Td>
                  <Link
                    href={`/pm/projects/${rfi.project.id}`}
                    className="text-sb-ink hover:underline"
                  >
                    {rfi.project.name}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge tone={statusTone(rfi.priority)}>
                    {rfi.priority}
                  </StatusBadge>
                </Td>
                <Td>{formatDate(rfi.dueDate)}</Td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}

      {overdueDeposits.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-sb-ink">
            Overdue deposits
          </h2>
          <DataTable headers={["Label", "Project", "Amount", "Due", "Status"]}>
            {overdueDeposits.map((deposit) => (
              <tr key={deposit.id}>
                <Td>{deposit.label}</Td>
                <Td>
                  {deposit.project ? (
                    <Link
                      href={`/pm/projects/${deposit.project.id}`}
                      className="text-sb-ink hover:underline"
                    >
                      {deposit.project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{formatCurrency(deposit.amount)}</Td>
                <Td>{formatDate(deposit.dueDate)}</Td>
                <Td>
                  <StatusBadge tone={statusTone(deposit.status)}>
                    {deposit.status}
                  </StatusBadge>
                </Td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}
    </div>
  );
}
