import Link from "next/link";
import { InvoiceStatus, Role } from "@prisma/client";
import { PageHeader, MetricCard, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { MetricBarChart, StatusDonutChart } from "@/components/dashboard/charts-lazy";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { buildProjectInsights } from "@/lib/insights";

export default async function BookkeeperOverviewPage() {
  const session = await requireRole([Role.BOOKKEEPER, Role.OWNER]);
  const companyId = session.membership.companyId;

  const [statusGroups, amountByStatus, invoices, deposits] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["status"],
      where: { project: { companyId } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { project: { companyId } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: { project: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { project: { select: { name: true, id: true } } },
    }),
    prisma.deposit.findMany({
      where: {
        project: { companyId },
        status: { in: ["PENDING", "DUE", "OVERDUE"] },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: { project: { select: { name: true } } },
    }),
  ]);

  const totalInvoices = amountByStatus._count._all;
  const outstandingStatuses: InvoiceStatus[] = [
    InvoiceStatus.SENT,
    InvoiceStatus.VIEWED,
    InvoiceStatus.OVERDUE,
  ];
  const totalOutstanding = statusGroups
    .filter((g) => outstandingStatuses.includes(g.status))
    .reduce((sum, g) => sum + (g._sum.amount ?? 0), 0);
  const overdueCount =
    statusGroups.find((g) => g.status === InvoiceStatus.OVERDUE)?._count._all ??
    0;
  const paidAmount =
    statusGroups.find((g) => g.status === InvoiceStatus.PAID)?._sum.amount ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookkeeper Dashboard"
        description="Invoices, deposits and payment status"
        actions={
          <Link href="/bookkeeper/invoices">
            <Button>Upload Invoice</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total invoices" value={totalInvoices} accent="blue" />
        <MetricCard
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          accent="orange"
        />
        <MetricCard label="Overdue" value={overdueCount} accent="red" />
        <MetricCard
          label="Paid"
          value={formatCurrency(paidAmount)}
          accent="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDonutChart
          title="Invoice status"
          data={statusGroups.map((g) => ({
            name: g.status,
            value: g._count._all,
          }))}
        />
        <MetricBarChart
          title="Collections snapshot"
          data={[
            { name: "Invoices", value: totalInvoices },
            { name: "Overdue", value: overdueCount },
            { name: "Deposits", value: deposits.length },
          ]}
        />
      </div>

      <AiInsightsPanel
        insights={buildProjectInsights({
          delayedScheduleCount: overdueCount,
          expectedDepositAmount: deposits.reduce((s, d) => s + d.amount, 0),
          pendingDocCount: invoices.filter((i) => i.status === "SENT").length,
        })}
        viewAllHref="/bookkeeper/invoices"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
            <h3 className="text-[16px] font-semibold">Recent invoices</h3>
            <Link href="/bookkeeper/invoices" className="text-sm text-[#f97316]">
              Manage all
            </Link>
          </div>
          <InteractiveDataTable
            searchPlaceholder="Search invoices…"
            emptyMessage="No invoices found"
            defaultPageSize={5}
            pageSizeOptions={[5, 10, 25]}
            tableClassName="border-0 shadow-none rounded-none"
            columns={[
              { key: "invoice", label: "Invoice" },
              { key: "project", label: "Project" },
              { key: "amount", label: "Amount" },
              { key: "due", label: "Due" },
              { key: "status", label: "Status" },
            ]}
            rows={invoices.map((inv) => ({
              id: inv.id,
              searchText: [inv.invoiceNumber, inv.project.name, inv.status]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                invoice: inv.invoiceNumber,
                project: inv.project.name,
                amount: Number(inv.amount),
                due: inv.dueDate?.getTime() ?? 0,
                status: inv.status,
              },
              cells: [
                <Td key="invoice" className="font-medium">
                  {inv.invoiceNumber}
                </Td>,
                <Td key="project">
                  <Link
                    href={`/pm/projects/${inv.project.id}`}
                    className="hover:text-[#f97316]"
                  >
                    {inv.project.name}
                  </Link>
                </Td>,
                <Td key="amount">{formatCurrency(inv.amount)}</Td>,
                <Td key="due">{formatDate(inv.dueDate)}</Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(inv.status)}>
                    {inv.status}
                  </StatusBadge>
                </Td>,
              ],
            }))}
          />
        </Card>

        <Card>
          <h3 className="mb-3 text-[16px] font-semibold">Deposit schedule</h3>
          <div className="space-y-2">
            {deposits.length === 0 ? (
              <p className="text-sm text-[#6b7280]">No pending deposits.</p>
            ) : (
              deposits.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-[#e5e7eb] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{d.label}</p>
                    <StatusBadge tone={statusTone(d.status)}>
                      {d.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-[#6b7280]">
                    {d.project?.name || "—"} · Due {formatDate(d.dueDate)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatCurrency(d.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
