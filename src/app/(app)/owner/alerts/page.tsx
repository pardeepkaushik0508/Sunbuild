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
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
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
      take: 500,
    }),
    prisma.rFI.findMany({
      where: {
        status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
        project: { companyId: { in: companyIds } },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 500,
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
      take: 500,
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
          <InteractiveDataTable
            searchPlaceholder="Search tasks…"
            emptyMessage="No high priority tasks found"
            columns={[
              { key: "task", label: "Task" },
              { key: "project", label: "Project" },
              { key: "priority", label: "Priority" },
              { key: "status", label: "Status" },
              { key: "due", label: "Due" },
            ]}
            rows={highPriorityTasks.map((task) => ({
              id: task.id,
              searchText: [
                task.title,
                task.project.name,
                task.priority,
                task.status,
                formatDate(task.dueDate),
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                task: task.title,
                project: task.project.name,
                priority: task.priority,
                status: task.status,
                due: task.dueDate?.getTime() ?? 0,
              },
              cells: [
                <Td key="task">
                  <Link
                    href={`/pm/tasks?projectId=${task.project.id}`}
                    className="font-medium text-sb-ink hover:underline"
                  >
                    {task.title}
                  </Link>
                </Td>,
                <Td key="project">
                  <Link
                    href={`/pm/projects/${task.project.id}`}
                    className="text-sb-ink hover:underline"
                  >
                    {task.project.name}
                  </Link>
                </Td>,
                <Td key="priority">
                  <StatusBadge tone={statusTone(task.priority)}>
                    {task.priority}
                  </StatusBadge>
                </Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(task.status)}>
                    {task.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Td>,
                <Td key="due">{formatDate(task.dueDate)}</Td>,
              ],
            }))}
          />
        </section>
      ) : null}

      {openRfis.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-sb-ink">Open RFIs</h2>
          <InteractiveDataTable
            searchPlaceholder="Search RFIs…"
            emptyMessage="No open RFIs found"
            columns={[
              { key: "rfi", label: "RFI" },
              { key: "project", label: "Project" },
              { key: "priority", label: "Priority" },
              { key: "due", label: "Due" },
            ]}
            rows={openRfis.map((rfi) => ({
              id: rfi.id,
              searchText: [
                rfi.title,
                rfi.project.name,
                rfi.priority,
                formatDate(rfi.dueDate),
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                rfi: rfi.title,
                project: rfi.project.name,
                priority: rfi.priority,
                due: rfi.dueDate?.getTime() ?? 0,
              },
              cells: [
                <Td key="rfi">{rfi.title}</Td>,
                <Td key="project">
                  <Link
                    href={`/pm/projects/${rfi.project.id}`}
                    className="text-sb-ink hover:underline"
                  >
                    {rfi.project.name}
                  </Link>
                </Td>,
                <Td key="priority">
                  <StatusBadge tone={statusTone(rfi.priority)}>
                    {rfi.priority}
                  </StatusBadge>
                </Td>,
                <Td key="due">{formatDate(rfi.dueDate)}</Td>,
              ],
            }))}
          />
        </section>
      ) : null}

      {overdueDeposits.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-sb-ink">
            Overdue deposits
          </h2>
          <InteractiveDataTable
            searchPlaceholder="Search deposits…"
            emptyMessage="No overdue deposits found"
            columns={[
              { key: "label", label: "Label" },
              { key: "project", label: "Project" },
              { key: "amount", label: "Amount" },
              { key: "due", label: "Due" },
              { key: "status", label: "Status" },
            ]}
            rows={overdueDeposits.map((deposit) => ({
              id: deposit.id,
              searchText: [
                deposit.label,
                deposit.project?.name,
                deposit.status,
                formatCurrency(deposit.amount),
                formatDate(deposit.dueDate),
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                label: deposit.label,
                project: deposit.project?.name ?? "",
                amount: Number(deposit.amount),
                due: deposit.dueDate?.getTime() ?? 0,
                status: deposit.status,
              },
              cells: [
                <Td key="label">{deposit.label}</Td>,
                <Td key="project">
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
                </Td>,
                <Td key="amount">{formatCurrency(deposit.amount)}</Td>,
                <Td key="due">{formatDate(deposit.dueDate)}</Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(deposit.status)}>
                    {deposit.status}
                  </StatusBadge>
                </Td>,
              ],
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
