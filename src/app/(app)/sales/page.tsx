import { Role } from "@prisma/client";
import { SalesKpiCards } from "@/components/sales/sales-kpi-cards";
import { SalesRecentActivities } from "@/components/sales/sales-recent-activities";
import { SalesPipeline } from "@/components/sales/sales-pipeline";
import { LeadsRequiringAction } from "@/components/sales/leads-requiring-action";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { ClientInfoStrip } from "@/components/dashboard/client-info-strip";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { requireRole } from "@/lib/session";
import { loadSalesOverviewData } from "@/lib/dashboard/load-sales-overview";

export default async function SalesOverviewPage() {
  const session = await requireRole([Role.SALES_MANAGER, Role.OWNER]);
  const companyId = session.membership.companyId;
  const data = await loadSalesOverviewData(
    companyId,
    session.membership.role === Role.SALES_MANAGER
      ? { salesUserId: session.user.id, session }
      : { session }
  );

  return (
    <div className="w-full space-y-5 pb-8">
      {/* PDF/Figma: KPI row is the first content block under the shell */}
      <SalesKpiCards kpis={data.kpis} error={data.sectionErrors.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SalesRecentActivities
          items={data.activities}
          error={data.sectionErrors.activities}
        />
        <TodoWidget
          items={data.todos}
          viewAllHref="/sales/activities"
          leads={data.leadsForForm}
          assignees={data.assignees}
          enableSalesCreate
        />
        <div className="lg:col-span-2 xl:col-span-1">
          <CalendarWidget
            events={data.calendarEvents}
            subtitle="Sales schedule overview"
            googleConnected={data.googleCalendarConnected}
            googleReconnectRequired={data.googleReconnectRequired}
            connectReturnPath="/sales"
          />
        </div>
      </div>

      <SalesPipeline
        stages={data.pipeline}
        error={data.sectionErrors.pipeline}
      />

      <LeadsRequiringAction
        leads={data.actionLeads}
        error={data.sectionErrors.actionLeads}
      />

      <ClientInfoStrip
        items={data.clientItems}
        viewAllHref="/sales/leads"
        error={data.sectionErrors.client ?? null}
        emptyMessage="No client/lead records yet."
        variant="pills"
      />

      <AiInsightsPanel
        insights={data.insights}
        viewAllHref="/sales/activities"
      />
    </div>
  );
}
