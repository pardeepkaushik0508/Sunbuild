import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeOrderStatus, Role, ScheduleStatus } from "@prisma/client";
import {
  assignSubcontractorAction,
  uploadCompletionDocumentAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ClientInfoStrip } from "@/components/dashboard/client-info-strip";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import { mapScheduleStatus } from "@/lib/schedule/gantt-status";
import {
  buildProjectInsights,
  depositOpenStatuses,
} from "@/lib/insights";
import {
  requireRole,
  getAccessibleProjectIds,
} from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName, whatsappLink, cn, mediaUrl } from "@/lib/utils";
import { loadProjectSubcontractorPayments } from "@/lib/payments/subcontractor-summary";
import { financeRolesCanSeeAllSubPayments } from "@/lib/payments/invoice-flow";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { computeBudgetUtilization } from "@/lib/jobs/budget";
import { loadCompanySubcontractors } from "@/lib/users/subcontractors";
import { formatPersonOptionLabel } from "@/lib/users/person-label";
import { FileText, FileSpreadsheet, Lock, ExternalLink } from "lucide-react";

type PageProps = {
  params: Promise<{ id: string }>;
};

const MODULE_LINKS = [
  { label: "Tasks", href: "tasks" },
  { label: "Schedule", href: "schedule" },
  { label: "RFIs", href: "rfis" },
  { label: "Daily Logs", href: "daily-logs" },
  { label: "Documents", href: "documents" },
  { label: "Photos", href: "photos" },
  { label: "Selections", href: "selections" },
  { label: "Change Orders", href: "change-orders" },
  { label: "Statement of Adjustments", href: "statement-of-adjustments" },
  { label: "Warranty", href: "warranty" },
];

export default async function PMProjectDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);
  if (!projectIds.includes(id)) notFound();

  const [
    project,
    completionDoc,
    subcontractors,
    scheduleItems,
    deposits,
    delayedCount,
    docsCount,
    projectTasks,
    progressSources,
    approvedChangeOrders,
    subPayments,
  ] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        buyer: true,
        pm: { select: { id: true, name: true, email: true } },
        contracts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            scheduleOfAllowances: {
              include: { items: true },
            },
          },
        },
        soas: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { items: true },
        },
        access: {
          include: {
            user: {
              select: { id: true, name: true, email: true, trade: true },
            },
          },
        },
      },
    }),
    prisma.completionDocument.findUnique({ where: { projectId: id } }),
    loadCompanySubcontractors(session.membership.companyId),
    prisma.scheduleItem.findMany({
      where: { projectId: id },
      orderBy: { startDate: "asc" },
      take: 20,
    }),
    prisma.deposit.findMany({
      where: { projectId: id, status: { in: depositOpenStatuses() } },
    }),
    prisma.scheduleItem.count({
      where: { projectId: id, status: ScheduleStatus.DELAYED },
    }),
    prisma.document.count({ where: { projectId: id } }),
    prisma.task.findMany({
      where: { projectId: id },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 8,
    }),
    prisma.project.findUnique({
      where: { id },
      select: {
        status: true,
        progressPercent: true,
        milestones: { select: { status: true } },
        scheduleItems: { select: { status: true } },
        tasks: { select: { status: true } },
      },
    }),
    prisma.changeOrder.findMany({
      where: { projectId: id, status: ChangeOrderStatus.APPROVED },
      select: { title: true, amount: true },
      orderBy: { clientActionAt: "asc" },
    }),
    financeRolesCanSeeAllSubPayments(session.membership.role)
      ? loadProjectSubcontractorPayments({ session, projectId: id })
      : Promise.resolve([]),
  ]);

  if (!project) notFound();

  const contract = project.contracts?.[0];
  const soa = contract?.scheduleOfAllowances ?? project.soas?.[0];
  const originalContractPrice = contract?.totalContractPrice ?? project.purchasePrice ?? 0;
  const approvedCOSum = approvedChangeOrders.reduce((acc, co) => acc + co.amount, 0);
  const revisedContractValue = originalContractPrice + approvedCOSum;

  const projectBudget = computeBudgetUtilization({
    purchasePrice: originalContractPrice || project.purchasePrice,
    approvedChangeOrders,
  });

  const liveProgress = progressSources
    ? computeProjectProgress({
        progressPercent: progressSources.progressPercent,
        status: progressSources.status,
        milestones: progressSources.milestones,
        scheduleItems: progressSources.scheduleItems,
        tasks: progressSources.tasks,
      })
    : project.progressPercent;

  const wa = whatsappLink(
    project.buyer?.phone,
    `Hi ${project.buyer?.firstName ?? "there"}, this is your Sunview project team.`
  );

  const insights = buildProjectInsights({
    delayedScheduleCount: delayedCount,
    expectedDepositAmount: deposits.reduce((s, d) => s + d.amount, 0),
    pendingDocCount: docsCount,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.name}
        description={project.municipalAddress ?? "Project detail"}
        actions={
          <>
            <Link href="/pm/projects">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
            <Link href={`/pm/schedule?projectId=${project.id}`}>
              <Button variant="outline" size="sm">
                Gantt
              </Button>
            </Link>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  WhatsApp buyer
                </Button>
              </a>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(project.status)}>
          {project.status.replace(/_/g, " ")}
        </StatusBadge>
        <span className="text-sm text-sb-muted">
          {liveProgress}% complete
        </span>
        {project.targetClosing ? (
          <span className="text-sm text-sb-muted">
            Target close {formatDate(project.targetClosing)}
          </span>
        ) : null}
      </div>

      {scheduleItems.length > 0 ? (
        <GanttChart
          tasks={scheduleItems.map((item) => ({
            id: item.id,
            title: item.title,
            startDate: item.startDate,
            endDate: item.endDate,
            status: mapScheduleStatus(item.status, item.endDate),
            assigneeName: item.assigneeName,
            trade: item.trade,
            dependsOnId: item.dependsOnId,
          }))}
          progressPercent={liveProgress}
          addHref={`/pm/schedule?projectId=${project.id}#add-schedule`}
        />
      ) : null}

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-sb-ink">Project Tasks</h2>
            <p className="text-sm text-sb-muted">
              Active and assigned tasks scoped to {project.name}
            </p>
          </div>
          <Link href={`/pm/tasks?projectId=${project.id}`}>
            <Button variant="outline" size="sm">
              Manage tasks →
            </Button>
          </Link>
        </div>
        {projectTasks.length === 0 ? (
          <p className="mt-4 text-sm text-sb-muted">
            No tasks created for this project yet.{" "}
            <Link
              href={`/pm/tasks?projectId=${project.id}`}
              className="text-sb-orange hover:underline font-medium"
            >
              Create first task
            </Link>
          </p>
        ) : (
          <div className="mt-4 divide-y divide-sb-border-subtle">
            {projectTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <p className="font-medium text-sb-ink truncate">{t.title}</p>
                  <p className="text-xs text-sb-muted">
                    Assignee: {t.assignee?.name ?? "Unassigned"}
                    {t.dueDate ? ` · Due ${formatDate(t.dueDate)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-semibold uppercase",
                      t.priority === "HIGH"
                        ? "bg-red-50 text-red-700"
                        : t.priority === "MEDIUM"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-50 text-slate-700"
                    )}
                  >
                    {t.priority}
                  </span>
                  <StatusBadge tone={statusTone(t.status)}>
                    {t.status.replace(/_/g, " ")}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ClientInfoStrip
        items={[
          {
            id: "deposit",
            label: "Client Deposit",
            value: deposits[0]
              ? `$${deposits[0].amount.toLocaleString()}`
              : "ÎÃÃ¶",
          },
          {
            id: "client",
            label: "Client Name",
            value: project.buyer
              ? fullName(project.buyer.firstName, project.buyer.lastName)
              : "ÎÃÃ¶",
          },
          {
            id: "lot",
            label: "Lot Info",
            value: project.lotInfo ?? "ÎÃÃ¶",
          },
          {
            id: "address",
            label: "Municipal Address",
            value: project.municipalAddress ?? "ÎÃÃ¶",
          },
          {
            id: "pm",
            label: "Project Manager",
            value: project.pm?.name ?? "ÎÃÃ¶",
          },
          {
            id: "price",
            label: "Total project cost",
            value: projectBudget.hasBudget
              ? formatCurrency(projectBudget.total)
              : "—",
          },
        ]}
        viewAllHref="/pm/contracts"
      />

      {subPayments.length > 0 ? (
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-ink">
            Subcontractor payments
          </h2>
          <ul className="mt-4 divide-y divide-sb-border">
            {subPayments.map((row) => (
              <li
                key={row.subcontractorId}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-sb-muted">
                    {row.trade || "Subcontractor"}
                    {row.lastPaymentAt
                      ? ` · Last payment ${formatDate(row.lastPaymentAt)}`
                      : ""}
                  </p>
                </div>
                <p className="font-semibold">
                  Paid: {formatCurrency(row.paidAmount)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Contract & Allowance Financial Summary (Read-Only for PM) */}
      <Card className="border-l-4 border-l-sb-blue">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sb-border pb-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-sb-blue" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-sb-ink">
                  Purchase Contract & Allowance Summary
                </h2>
                {contract?.status ? (
                  <StatusBadge tone={statusTone(contract.status)}>
                    {contract.status.replace(/_/g, " ")}
                  </StatusBadge>
                ) : null}
              </div>
              <p className="text-xs text-sb-muted">
                {contract?.contractNumber ? `${contract.contractNumber} (v${contract.version})` : "Standard Builder Agreement"} · Managed authoritatively by Sales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-sb-muted bg-neutral-100 px-2.5 py-1 rounded-md">
            <Lock className="h-3.5 w-3.5 text-sb-muted" />
            <span>Read-Only (PM View)</span>
          </div>
        </div>

        {/* Pricing Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-sb-border text-xs">
          <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
            <span className="text-sb-muted block uppercase tracking-wider text-[10px] font-semibold">
              Original Contract Value
            </span>
            <span className="text-lg font-bold font-mono text-sb-ink mt-0.5 block">
              {formatCurrency(originalContractPrice)}
            </span>
            <span className="text-[11px] text-sb-muted">Immutable baseline</span>
          </div>

          <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
            <span className="text-sb-muted block uppercase tracking-wider text-[10px] font-semibold">
              Approved Change Orders
            </span>
            <span className="text-lg font-bold font-mono text-sb-ink mt-0.5 block">
              +{formatCurrency(approvedCOSum)}
            </span>
            <span className="text-[11px] text-sb-muted">{approvedChangeOrders.length} approved change orders</span>
          </div>

          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
            <span className="text-emerald-800 block uppercase tracking-wider text-[10px] font-bold">
              Current Revised Contract Value
            </span>
            <span className="text-lg font-black font-mono text-emerald-700 mt-0.5 block">
              {formatCurrency(revisedContractValue)}
            </span>
            <span className="text-[11px] text-emerald-700">Original + Approved COs</span>
          </div>
        </div>

        {/* Statement of Adjustments (closing) */}
        <div className="flex flex-col gap-3 rounded-[14px] border border-sb-border bg-sb-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sb-ink" />
            <div>
              <p className="text-sm font-semibold text-sb-ink">
                Statement of Adjustments
              </p>
              <p className="text-xs text-sb-muted">
                Closing settlement PDF from contract, approved COs &amp; deposits
              </p>
            </div>
          </div>
          <Link href={`/pm/projects/${project.id}/statement-of-adjustments`}>
            <Button size="sm">Open SOA</Button>
          </Link>
        </div>

        {/* Schedule of Allowances (budget) Breakdown */}
        {soa ? (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-sb-orange" />
                <h3 className="font-semibold text-xs text-sb-ink uppercase tracking-wider">
                  Schedule of Allowances ({soa.soaNumber})
                </h3>
              </div>
              <span className="text-xs text-sb-muted">
                {soa.items.length} budgeted allowance items
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-center">
              <div className="border border-sb-border rounded-lg p-2">
                <span className="text-sb-muted text-[11px] block">Allowance Budget</span>
                <span className="font-mono font-bold text-sb-ink text-sm">
                  {formatCurrency(soa.totalAllowance)}
                </span>
              </div>
              <div className="border border-sb-border rounded-lg p-2">
                <span className="text-sb-muted text-[11px] block">Committed</span>
                <span className="font-mono font-bold text-blue-600 text-sm">
                  {formatCurrency(soa.committedAmount)}
                </span>
              </div>
              <div className="border border-sb-border rounded-lg p-2">
                <span className="text-sb-muted text-[11px] block">Remaining</span>
                <span className="font-mono font-bold text-emerald-600 text-sm">
                  {formatCurrency(soa.remainingAmount)}
                </span>
              </div>
              <div className="border border-sb-border rounded-lg p-2">
                <span className="text-sb-muted text-[11px] block">Overages</span>
                <span className={`font-mono font-bold text-sm ${soa.overageAmount > 0 ? "text-sb-red" : "text-sb-muted"}`}>
                  {formatCurrency(soa.overageAmount)}
                </span>
              </div>
            </div>

            {soa.items.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {soa.items.slice(0, 6).map((it) => (
                  <span
                    key={it.id}
                    className="inline-flex items-center gap-1 rounded bg-gray-50 border border-gray-200 px-2 py-1 text-[11px]"
                  >
                    <span className="text-sb-ink font-medium">{it.name}:</span>
                    <span className="font-mono text-sb-muted">{formatCurrency(it.amount)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {projectBudget.changeOrders.length > 0 ? (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-sb-ink">
            Approved change orders
          </h2>
          <p className="mt-1 text-sm text-sb-muted">
            Added to purchase price ({formatCurrency(projectBudget.baseTotal)})
            for a total of {formatCurrency(projectBudget.total)}.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {projectBudget.changeOrders.map((co, idx) => (
              <li
                key={`${co.title}-${idx}`}
                className="flex items-start justify-between gap-3 border-b border-sb-border pb-2 last:border-0 last:pb-0"
              >
                <span>{co.title}</span>
                <span className="shrink-0 font-medium">
                  +{formatCurrency(co.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AiInsightsPanel
        insights={insights}
        viewAllHref={`/pm/schedule?projectId=${project.id}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-sb-ink">Buyer</h2>
          {project.buyer ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-sb-muted">Name</dt>
                <dd className="font-medium">
                  {fullName(project.buyer.firstName, project.buyer.lastName)}
                </dd>
              </div>
              <div>
                <dt className="text-sb-muted">Email</dt>
                <dd>{project.buyer.email ?? "ÎÃÃ¶"}</dd>
              </div>
              <div>
                <dt className="text-sb-muted">Phone</dt>
                <dd>{project.buyer.phone ?? "ÎÃÃ¶"}</dd>
              </div>
              <div>
                <dt className="text-sb-muted">Mailing address</dt>
                <dd>{project.buyer.mailingAddress ?? "ÎÃÃ¶"}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-sb-muted">No buyer linked.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-sb-ink">Team access</h2>
          <ul className="mt-4 space-y-2">
            {project.pm ? (
              <li className="rounded-[10px] border border-sb-border px-3 py-2 text-sm">
                <span className="font-medium">{project.pm.name}</span>
                <span className="ml-2 text-xs text-sb-muted">
                  Project Manager
                </span>
              </li>
            ) : null}
            {project.access.map((access) => (
              <li
                key={access.id}
                className="rounded-[10px] border border-sb-border px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {formatPersonOptionLabel(access.user.name, {
                    role: access.role,
                    trade: access.user.trade,
                  })}
                </span>
                {access.user.email ? (
                  <span className="ml-2 text-xs text-sb-muted">
                    {access.user.email}
                  </span>
                ) : null}
              </li>
            ))}
            {project.access.length === 0 && !project.pm ? (
              <li className="text-sm text-sb-muted">
                No team members assigned.
              </li>
            ) : null}
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-sb-ink">
            Assign subcontractor
          </h2>
          <ActionForm
            action={assignSubcontractorAction}
            successMessage="Subcontractor assigned"
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <FormField label="Subcontractor" className="sm:col-span-2">
              <Select name="userId" required defaultValue="">
                <option value="" disabled>
                  Select subcontractor
                </option>
                {subcontractors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Assigning…">
                Assign to project
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-sb-ink">
            Completion document
          </h2>
          {completionDoc ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                Status:{" "}
                <StatusBadge tone={statusTone(completionDoc.status)}>
                  {completionDoc.status.replace(/_/g, " ")}
                </StatusBadge>
              </p>
              <a
                href={mediaUrl(completionDoc.filePath) ?? "#"}
                className="text-sb-ink underline hover:text-sb-orange"
                target="_blank"
                rel="noreferrer"
              >
                {completionDoc.fileName}
              </a>
            </div>
          ) : null}
          <ActionForm
            action={uploadCompletionDocumentAction}
            successMessage="Completion document uploaded"
            encType="multipart/form-data"
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <FormField label="Upload completion PDF">
              <Input
                name="file"
                type="file"
                accept=".pdf,application/pdf"
                required
              />
            </FormField>
            <SubmitButton pendingLabel="Uploading…">
              Upload for CEO approval
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-sb-ink">Project modules</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {MODULE_LINKS.map((mod) => (
            <Link
              key={mod.href}
              href={`/pm/${mod.href}?projectId=${project.id}`}
              className="rounded-[12px] border border-sb-border bg-sb-canvas/40 px-4 py-3 text-sm font-medium text-sb-ink shadow-sm transition hover:border-sb-orange/40 hover:bg-sb-yellow-soft"
            >
              {mod.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
