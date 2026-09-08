import Link from "next/link";
import { LeadStatus, ProposalStatus, Role } from "@prisma/client";
import { PageHeader, Card, MetricCard } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

export default async function SalesReportsPage() {
  const session = await requireRole([Role.SALES_MANAGER, Role.OWNER]);
  const companyId = session.membership.companyId;

  const [leadGroups, wonAgg, proposals] = await Promise.all([
    prisma.lead.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
    }),
    prisma.lead.aggregate({
      where: { companyId, status: LeadStatus.WON },
      _sum: { estimatedValue: true },
      _avg: { estimatedValue: true },
      _count: { _all: true },
    }),
    prisma.proposal.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
    }),
  ]);

  const total = leadGroups.reduce((s, g) => s + g._count._all, 0);
  const won = wonAgg._count._all;
  const conversion = total > 0 ? Math.round((won / total) * 100) : null;
  const activeProposals = proposals
    .filter(
      (p) =>
        p.status === ProposalStatus.DRAFT || p.status === ProposalStatus.SENT
    )
    .reduce((s, g) => s + g._count._all, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Simple sales summaries from live lead and proposal data"
        actions={
          <Link
            href="/sales"
            className="text-sm font-medium text-sb-orange hover:underline"
          >
            Back to overview
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total leads" value={total} accent="blue" />
        <MetricCard
          label="Active proposals"
          value={activeProposals}
          accent="purple"
        />
        <MetricCard
          label="Conversion"
          value={conversion == null ? "—" : `${conversion}%`}
          accent="green"
        />
        <MetricCard
          label="Won revenue"
          value={formatCurrency(wonAgg._sum.estimatedValue)}
          accent="orange"
          hint={
            wonAgg._avg.estimatedValue != null
              ? `Avg ${formatCurrency(wonAgg._avg.estimatedValue)}`
              : undefined
          }
        />
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-sb-ink">Leads by status</h2>
        <ul className="mt-4 space-y-2">
          {Object.values(LeadStatus).map((status) => {
            const count =
              leadGroups.find((g) => g.status === status)?._count._all ?? 0;
            return (
              <li
                key={status}
                className="flex items-center justify-between rounded-lg border border-sb-border px-3 py-2 text-sm"
              >
                <span>{status.replace(/_/g, " ")}</span>
                <span className="font-semibold text-sb-ink">{count}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-sb-muted">
          Advanced forecasting and employee performance scoring are outside MVP
          scope.
        </p>
      </Card>
    </div>
  );
}
