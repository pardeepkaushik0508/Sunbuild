import { Role } from "@prisma/client";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { loadOverviewDashboardData } from "@/lib/dashboard/load-overview";
import { requireRole } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{ projectId?: string; companyId?: string }>;
};

export default async function OwnerOverviewPage({ searchParams }: PageProps) {
  const session = await requireRole(Role.OWNER);
  const { projectId, companyId } = await searchParams;

  const data = await loadOverviewDashboardData({
    session,
    selectedProjectId: projectId ?? null,
    selectedCompanyId: companyId ?? null,
    basePath: "/owner",
  });

  return <OverviewDashboard data={data} />;
}
