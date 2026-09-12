import { OrganizationHeader } from "@/components/dashboard/organization-header";
import { OrganizationManagement } from "@/components/dashboard/organization-management";
import { OwnerTabs } from "@/components/owner/owner-tabs";
import { RecentJobsCard } from "@/components/dashboard/recent-jobs-widget";
import { HighPriorityMicrosoftCard } from "@/components/dashboard/high-priority-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { ClientInfoStrip } from "@/components/dashboard/client-info-strip";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import type { OverviewDashboardData } from "@/lib/dashboard/load-overview";

export function OverviewDashboard({ data }: { data: OverviewDashboardData }) {
  const ganttWithLinks = data.ganttTasks.map((t) => ({
    ...t,
    href:
      t.isPhase || t.status === "PHASE"
        ? null
        : data.selectedProjectId
          ? `/pm/projects/${data.selectedProjectId}`
          : "/pm/schedule",
  }));

  const settingsHref =
    data.basePath === "/owner" ? "/owner/settings" : "/pm/projects";
  const usersHref = data.basePath === "/owner" ? "/owner/users" : undefined;

  return (
    <div className="w-full space-y-5">
      {data.showOwnerChrome ? (
        <>
          <OrganizationManagement companies={data.companies} />
          <OwnerTabs />
        </>
      ) : (
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
              value: String(data.orgStats.activeProjects),
            },
            {
              label: "Open tasks",
              value: String(data.orgStats.openTasks),
            },
            {
              label: "Team",
              value: String(data.orgStats.teamMembers),
            },
          ]}
        />
      )}

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentJobsCard
          jobs={data.jobs}
          selectedProjectId={data.selectedProjectId}
          selectHrefBase={
            data.selectedCompanyId
              ? `${data.basePath}?companyId=${data.selectedCompanyId}`
              : data.basePath
          }
          viewAllHref={data.jobsViewAllHref}
        />
        {data.showOwnerChrome ? (
          <HighPriorityMicrosoftCard
            viewAllHref={data.highPriorityViewAllHref}
            connectReturnPath={data.basePath}
            initialConnection={data.microsoftTodoConnection}
          />
        ) : (
          <TodoWidget
            items={data.todos}
            viewAllHref={data.todoViewAllHref}
            projects={data.projectsForTaskForm}
            assignees={data.assigneesForTaskForm}
            defaultProjectId={data.selectedProjectId}
            enableCreate
          />
        )}
        <div className="lg:col-span-2 xl:col-span-1">
          <CalendarWidget
            events={data.calendarEvents}
            googleConnected={data.googleCalendarConnected}
            googleReconnectRequired={data.googleReconnectRequired}
            connectReturnPath={data.basePath}
          />
        </div>
      </div>

      <GanttChart
        className="w-full"
        tasks={ganttWithLinks}
        progressPercent={data.progressPercent}
        addHref={data.addScheduleHref}
        projectLabel={data.selectedProjectName}
      />

      <ClientInfoStrip
        items={data.clientItems}
        viewAllHref={data.clientViewAllHref}
      />

      <AiInsightsPanel
        insights={data.insights}
        viewAllHref={data.insightsViewAllHref}
      />
    </div>
  );
}
