import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, MetricCard, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompanyOverviewCard } from "@/components/dashboard/company-overview-card";
import { MetricBarChart, StatusDonutChart } from "@/components/dashboard/charts-lazy";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";

export default async function AdminOverviewPage() {
  const session = await requireRole(Role.OPERATIONS_ADMIN);
  const companyId = session.membership.companyId;

  const [users, projects, contracts, pendingContracts, company] =
    await Promise.all([
      prisma.membership.count({ where: { companyId, isActive: true } }),
      prisma.project.count({ where: { companyId } }),
      prisma.purchaseContract.count({
        where: {
          OR: [
            { project: { companyId } },
            { uploadedBy: { memberships: { some: { companyId } } } },
          ],
        },
      }),
      prisma.purchaseContract.count({
        where: {
          status: { in: ["UPLOADED", "IN_REVIEW"] },
          OR: [
            { project: { companyId } },
            { uploadedBy: { memberships: { some: { companyId } } } },
          ],
        },
      }),
      prisma.company.findUnique({ where: { id: companyId } }),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Admin"
        description="Company operations, users and project access"
        actions={
          <Link href="/owner/users">
            <Button variant="outline">User directory</Button>
          </Link>
        }
      />

      <CompanyOverviewCard
        name={company?.name ?? "Sunview Custom Homes"}
        tagline="Operational administration"
        metrics={[
          { label: "Users", value: users, accent: "blue" },
          { label: "Projects", value: projects, accent: "green" },
          { label: "Contracts", value: contracts, accent: "indigo" },
          {
            label: "In review",
            value: pendingContracts,
            accent: "orange",
          },
        ]}
        detailsHref="/pm/projects"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDonutChart
          title="Ops coverage"
          data={[
            { name: "Users", value: users },
            { name: "Projects", value: projects },
            { name: "Contracts", value: contracts },
          ]}
        />
        <MetricBarChart
          title="Admin workload"
          data={[
            { name: "Users", value: users },
            { name: "Projects", value: projects },
            { name: "In review", value: pendingContracts },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="Active users" value={users} accent="blue" />
        <MetricCard label="Projects" value={projects} accent="green" />
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Contracts workspace</p>
            <p className="text-xs text-[#6b7280]">Upload and review</p>
          </div>
          <Link href="/pm/contracts">
            <Button size="sm">Open</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
