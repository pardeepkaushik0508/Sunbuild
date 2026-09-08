import Link from "next/link";
import { CompletionDocStatus, ProjectStatus, Role } from "@prisma/client";
import { PageHeader, MetricCard, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecentJobsWidget } from "@/components/dashboard/recent-jobs-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { MetricBarChart, StatusDonutChart } from "@/components/dashboard/charts-lazy";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";

export default async function CeoOverviewPage() {
  const session = await requireRole([Role.CEO, Role.OWNER]);
  const companyId = session.membership.companyId;

  const companyProjects = await prisma.project.findMany({
    where: { companyId },
    select: { id: true },
  });
  const projectIdList = companyProjects.map((p) => p.id);

  const [active, pendingApprovals, projects, openRfis] = await Promise.all([
    prisma.project.count({
      where: {
        companyId,
        status: {
          in: [
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.PRE_CONSTRUCTION,
            ProjectStatus.SUBSTANTIAL_COMPLETION,
          ],
        },
      },
    }),
    prisma.completionDocument.count({
      where: {
        status: CompletionDocStatus.PENDING_CEO_APPROVAL,
        projectId: { in: projectIdList },
      },
    }),
    prisma.project.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    prisma.rFI.count({
      where: {
        project: { companyId },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CEO Overview"
        description="Operational visibility across Sunview Homes"
        actions={
          <Link href="/ceo/approvals">
            <Button>Completion Approvals</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Active projects" value={active} accent="green" />
        <MetricCard
          label="Pending approvals"
          value={pendingApprovals}
          accent="orange"
        />
        <MetricCard label="Open RFIs" value={openRfis} accent="blue" />
        <MetricCard
          label="Jobs tracked"
          value={projects.length}
          accent="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusDonutChart
          title="Executive attention"
          data={[
            { name: "Active", value: active },
            { name: "Approvals", value: pendingApprovals },
            { name: "RFIs", value: openRfis },
          ]}
        />
        <MetricBarChart
          title="Portfolio load"
          data={[
            { name: "Active", value: active },
            { name: "Approvals", value: pendingApprovals },
            { name: "RFIs", value: openRfis },
            { name: "Jobs", value: projects.length },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentJobsWidget
          jobs={projects.map((p) => ({
            id: p.id,
            name: p.name,
            progressPercent: p.progressPercent,
            href: `/pm/projects/${p.id}`,
          }))}
        />
        <Card>
          <h3 className="mb-3 text-[16px] font-semibold">Quick actions</h3>
          <div className="space-y-2">
            <Link
              href="/ceo/approvals"
              className="block rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm font-medium hover:border-[#fdba74]"
            >
              Review completion documents →
            </Link>
            <Link
              href="/pm/projects"
              className="block rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm font-medium hover:border-[#fdba74]"
            >
              Browse all jobs →
            </Link>
          </div>
          <div className="mt-4">
            <CalendarWidget />
          </div>
        </Card>
      </div>
    </div>
  );
}
