import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState, MetricCard } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { FileSpreadsheet, FileText, Eye, Printer } from "lucide-react";

export default async function SalesSoaListPage() {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);

  const companyId = session.membership.companyId;

  const soas = await prisma.scheduleOfAllowances.findMany({
    where: {
      OR: [
        { companyId },
        { contract: { companyId } },
        { project: { companyId } },
      ],
    },
    include: {
      contract: {
        select: {
          id: true,
          contractNumber: true,
          status: true,
          projectName: true,
          buyerFirstName: true,
          buyerLastName: true,
        },
      },
      buyer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      project: { select: { id: true, name: true } },
      items: { select: { id: true, status: true, amount: true, actualCost: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalBudget = soas.reduce((acc, s) => acc + Number(s.totalAllowance ?? 0), 0);
  const totalCommitted = soas.reduce((acc, s) => acc + Number(s.committedAmount ?? 0), 0);
  const totalRemaining = soas.reduce((acc, s) => acc + Number(s.remainingAmount ?? 0), 0);
  const totalOverages = soas.reduce((acc, s) => acc + Number(s.overageAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule of Allowances (SOA)"
        description="Authoritative client allowance schedules, finish budgets, and selection package allocations"
        icon={<FileSpreadsheet className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/sales/contracts">
              <Button variant="outline" size="sm">
                <FileText className="mr-1.5 h-4 w-4 text-sb-muted" />
                Purchase Contracts
              </Button>
            </Link>
          </div>
        }
      />

      {/* Allowance Financial Health */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Allowance Budget"
          value={formatCurrency(totalBudget)}
          hint={`${soas.length} active schedules`}
          accent="blue"
        />
        <MetricCard
          label="Total Committed"
          value={formatCurrency(totalCommitted)}
          hint="Selections confirmed by clients"
          accent="purple"
        />
        <MetricCard
          label="Unallocated Remaining"
          value={formatCurrency(totalRemaining)}
          hint="Available for client selections"
          accent="green"
        />
        <MetricCard
          label="Accumulated Overages"
          value={formatCurrency(totalOverages)}
          hint="Flowing into Change Orders"
          accent="red"
        />
      </div>

      {soas.length === 0 ? (
        <EmptyState
          title="No Schedule of Allowances found"
          description="Schedule of Allowances are automatically created when generating a new Purchase Contract."
          action={
            <Link href="/sales/contracts/new">
              <Button>Create Purchase Contract & SOA</Button>
            </Link>
          }
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search by SOA #, Contract #, buyer, or project…"
          emptyMessage="No allowance schedules match your search"
          columns={[
            { key: "soa", label: "SOA #" },
            { key: "contract", label: "Linked Contract" },
            { key: "buyer", label: "Buyer" },
            { key: "project", label: "Project" },
            { key: "budget", label: "Budget Total" },
            { key: "committed", label: "Committed" },
            { key: "remaining", label: "Remaining" },
            { key: "status", label: "Status" },
            { key: "actions", label: "Actions" },
          ]}
          rows={soas.map((s) => {
            const buyer =
              s.buyer
                ? fullName(s.buyer.firstName, s.buyer.lastName)
                : fullName(s.contract?.buyerFirstName, s.contract?.buyerLastName) || "—";
            const projectName = s.project?.name ?? s.contract?.projectName ?? "—";
            const contractNum = s.contract?.contractNumber ?? "—";
            const totalNum = Number(s.totalAllowance ?? 0);
            const committedNum = Number(s.committedAmount ?? 0);
            const remainingNum = Number(s.remainingAmount ?? 0);

            return {
              id: s.id,
              searchText: [
                s.soaNumber,
                `v${s.version}`,
                contractNum,
                buyer,
                projectName,
                s.status,
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                soa: s.soaNumber,
                contract: contractNum,
                buyer,
                project: projectName,
                budget: totalNum,
                committed: committedNum,
                remaining: remainingNum,
                status: s.status,
              },
              cells: [
                <Td key="soa">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/sales/soa/${s.id}`}
                      className="font-semibold text-sb-ink hover:text-sb-orange hover:underline"
                    >
                      {s.soaNumber}
                    </Link>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-sb-muted">
                      v{s.version}
                    </span>
                  </div>
                  <p className="text-xs text-sb-muted">{formatDate(s.createdAt)}</p>
                </Td>,
                <Td key="contract">
                  {s.contract ? (
                    <Link
                      href={`/sales/contracts/${s.contract.id}`}
                      className="font-medium hover:underline text-sb-ink flex items-center gap-1"
                    >
                      <FileText className="h-3 w-3 text-sb-muted" />
                      {contractNum}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>,
                <Td key="buyer" className="font-medium text-sb-ink">
                  {buyer}
                </Td>,
                <Td key="project">
                  {s.project ? (
                    <Link
                      href={`/pm/projects/${s.project.id}`}
                      className="hover:underline text-sb-ink"
                    >
                      {s.project.name}
                    </Link>
                  ) : (
                    projectName
                  )}
                </Td>,
                <Td key="budget" className="font-mono font-semibold text-sb-ink">
                  {formatCurrency(totalNum)}
                </Td>,
                <Td key="committed" className="font-mono text-blue-600">
                  {formatCurrency(committedNum)}
                </Td>,
                <Td key="remaining" className="font-mono font-medium text-emerald-600">
                  {formatCurrency(remainingNum)}
                </Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(s.status)}>
                    {s.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Td>,
                <Td key="actions">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/sales/soa/${s.id}`}>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Manage
                      </Button>
                    </Link>
                    <a
                      href={`/sales/soa/${s.id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Print SOA">
                        <Printer className="h-3.5 w-3.5 text-sb-muted" />
                      </Button>
                    </a>
                  </div>
                </Td>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}
