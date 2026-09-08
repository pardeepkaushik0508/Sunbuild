import Link from "next/link";
import { OrganizationHeader } from "@/components/dashboard/organization-header";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStatisticsCard } from "@/components/jobs/job-statistics";
import { JobsToolbar } from "@/components/jobs/jobs-toolbar";
import { JobCard } from "@/components/jobs/job-card";
import { JobActions } from "@/components/jobs/job-actions";
import { JobsPagination } from "@/components/jobs/jobs-pagination";
import type { JobsDashboardData } from "@/lib/jobs/load-jobs";

export function JobsManagementDashboard({ data }: { data: JobsDashboardData }) {
  const settingsHref =
    data.basePath === "/owner/jobs" ? "/owner/settings" : "/pm/projects";
  const usersHref =
    data.basePath === "/owner/jobs" ? "/owner/users" : undefined;

  return (
    <div className="w-full space-y-5">
      <OrganizationHeader
        companyName={data.company.name}
        brand={data.company.brand}
        slug={data.company.slug}
        isActive={data.company.isActive}
        settingsHref={settingsHref}
        usersHref={usersHref}
        details={[
          {
            label: "Active projects",
            value: String(data.stats.activeProjects),
          },
          {
            label: "In planning",
            value: String(data.stats.inPlanning),
          },
          {
            label: "Completed",
            value: String(data.stats.completed),
          },
        ]}
      />

      <JobStatisticsCard stats={data.stats} />

      <section className="space-y-4">
        <JobsToolbar
          companies={data.companies}
          selectedCompanyId={data.selectedCompanyId}
          createJobHref={data.createJobHref}
          canCreateJob={data.canCreateJob}
          search={data.search}
          statusFilter={data.statusFilter}
          sort={data.sort}
          pmFilter={data.pmFilter}
          clientFilter={data.clientFilter}
          pmOptions={data.pmOptions}
          clientOptions={data.clientOptions}
        />

        {data.jobs.length === 0 ? (
          <EmptyState
            title="No jobs found"
            description={
              data.search ||
              data.statusFilter !== "all" ||
              data.pmFilter ||
              data.clientFilter
                ? "Try adjusting search or filters."
                : "Upload a purchase contract or convert a lead to create a job."
            }
            action={
              data.canCreateJob ? (
                <Link href={data.createJobHref}>
                  <Button variant="secondary">Create New Job</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {data.jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                canConfigure={data.canConfigure}
                canViewBudget={data.canViewBudget}
                projectManagers={data.pmOptions}
              />
            ))}
            <JobsPagination
              page={data.page}
              totalPages={data.totalPages}
              totalCount={data.totalCount}
            />
          </div>
        )}
      </section>

      <div className="max-w-md">
        <JobActions
          createJobHref={data.createJobHref}
          scheduleHref={data.scheduleHref}
          reportsHref={data.reportsHref}
          budgetOverviewHref={data.budgetOverviewHref}
          canCreateJob={data.canCreateJob}
          canViewBudget={data.canViewBudget}
          canManageSchedule={data.canManageSchedule}
        />
      </div>

      <AiInsightsPanel
        insights={data.insights}
        viewAllHref={
          data.basePath === "/owner/jobs" ? "/owner/alerts" : "/pm/schedule"
        }
      />
    </div>
  );
}
