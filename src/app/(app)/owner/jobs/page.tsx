import { Suspense } from "react";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { loadJobsDashboardData } from "@/lib/jobs/load-jobs";
import { JobsManagementDashboard } from "@/components/jobs/jobs-management-dashboard";
import { JobStatisticsSkeleton } from "@/components/jobs/job-statistics";
import { JobCardsSkeleton } from "@/components/jobs/job-card";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function param(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function OwnerJobsPage({ searchParams }: PageProps) {
  const session = await requireRole(Role.OWNER);
  const sp = await searchParams;

  const data = await loadJobsDashboardData({
    session,
    basePath: "/owner/jobs",
    companyId: param(sp.companyId),
    search: param(sp.q),
    status: param(sp.status),
    sort: param(sp.sort),
    page: param(sp.page),
    pmId: param(sp.pmId),
    clientId: param(sp.clientId),
  });

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <JobStatisticsSkeleton />
          <JobCardsSkeleton />
        </div>
      }
    >
      <JobsManagementDashboard data={data} />
    </Suspense>
  );
}
