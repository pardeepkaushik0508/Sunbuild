import { Role } from "@prisma/client";
import { OwnerTabs } from "@/components/owner/owner-tabs";
import { PageHeader, MetricCard, Card } from "@/components/ui/card";
import { MetricBarChart, StatusDonutChart } from "@/components/dashboard/charts-lazy";
import {
  loadCompanyOverviewStats,
  resolveOwnerCompanies,
} from "@/lib/dashboard/company-stats";
import { requireRole } from "@/lib/session";

export default async function OwnerKpisPage() {
  const session = await requireRole(Role.OWNER);
  const companies = resolveOwnerCompanies(session);
  const stats = await loadCompanyOverviewStats(companies.map((c) => c.id));

  const totals = stats.reduce(
    (acc, c) => {
      acc.users += c.users;
      acc.activeProjects += c.activeProjects;
      acc.completed += c.completed;
      acc.deadlines += c.deadlines;
      acc.revenue += c.revenue;
      return acc;
    },
    { users: 0, activeProjects: 0, completed: 0, deadlines: 0, revenue: 0 }
  );

  const avgGrowth =
    stats.length === 0
      ? 0
      : Number(
          (
            stats.reduce((s, c) => s + c.growthPercent, 0) / stats.length
          ).toFixed(1)
        );

  return (
    <div className="space-y-5">
      <OwnerTabs />
      <PageHeader
        title="KPI Management"
        description="Organization-wide performance metrics across all companies"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Users" value={totals.users} accent="blue" />
        <MetricCard
          label="Active Projects"
          value={totals.activeProjects}
          accent="green"
        />
        <MetricCard label="Completed" value={totals.completed} accent="purple" />
        <MetricCard label="Avg Growth" value={`${avgGrowth}%`} accent="orange" />
        <MetricCard label="Deadlines" value={totals.deadlines} accent="red" />
        <MetricCard
          label="Pipeline Revenue"
          value={
            stats[0]
              ? // reuse compact formatting via first company's helper path
                new Intl.NumberFormat("en-CA", {
                  style: "currency",
                  currency: "CAD",
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(totals.revenue)
              : "$0"
          }
          accent="indigo"
        />
      </div>

      {stats.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-sb-muted">
            No company KPI data available.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatusDonutChart
            title="Active vs Completed"
            data={[
              { name: "Active", value: totals.activeProjects },
              { name: "Completed", value: totals.completed },
            ]}
          />
          <MetricBarChart
            title="Projects by company"
            data={stats.map((c) => ({
              name: c.brand || c.name.split(" ")[0] || c.name,
              value: c.activeProjects,
            }))}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((c) => (
          <Card key={c.id}>
            <p className="text-sm font-semibold text-sb-ink">{c.name}</p>
            <p className="mt-0.5 text-xs text-sb-muted">
              {c.description || c.brand || "Company"}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-sb-muted">Users</dt>
                <dd className="font-semibold">{c.users}</dd>
              </div>
              <div>
                <dt className="text-xs text-sb-muted">Active</dt>
                <dd className="font-semibold">{c.activeProjects}</dd>
              </div>
              <div>
                <dt className="text-xs text-sb-muted">Growth</dt>
                <dd className="font-semibold">{c.growthPercent}%</dd>
              </div>
              <div>
                <dt className="text-xs text-sb-muted">Revenue</dt>
                <dd className="font-semibold">{c.revenueLabel}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
