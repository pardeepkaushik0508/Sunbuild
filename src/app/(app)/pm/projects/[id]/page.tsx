import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, ScheduleStatus } from "@prisma/client";
import {
  assignSubcontractorAction,
  uploadCompletionDocumentAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
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
import { formatDate, fullName, whatsappLink } from "@/lib/utils";

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
  ] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        buyer: true,
        pm: { select: { id: true, name: true, email: true } },
        access: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.completionDocument.findUnique({ where: { projectId: id } }),
    prisma.membership.findMany({
      where: {
        companyId: session.membership.companyId,
        role: Role.SUBCONTRACTOR,
        isActive: true,
      },
      include: { user: { select: { id: true, name: true } } },
    }),
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
  ]);

  if (!project) notFound();

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
          {project.progressPercent}% complete
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
          progressPercent={project.progressPercent}
          addHref={`/pm/schedule?projectId=${project.id}#add-schedule`}
        />
      ) : null}

      <ClientInfoStrip
        items={[
          {
            id: "deposit",
            label: "Sales Deposit",
            value: deposits[0]
              ? `$${deposits[0].amount.toLocaleString()}`
              : "—",
          },
          {
            id: "client",
            label: "Client Name",
            value: project.buyer
              ? fullName(project.buyer.firstName, project.buyer.lastName)
              : "—",
          },
          {
            id: "lot",
            label: "Lot Info",
            value: project.lotInfo ?? "—",
          },
          {
            id: "address",
            label: "Municipal Address",
            value: project.municipalAddress ?? "—",
          },
          {
            id: "pm",
            label: "Project Manager",
            value: project.pm?.name ?? "—",
          },
          {
            id: "price",
            label: "Purchase Price",
            value: project.purchasePrice
              ? `$${project.purchasePrice.toLocaleString()}`
              : "—",
          },
        ]}
        viewAllHref="/pm/contracts"
      />

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
                <dd>{project.buyer.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sb-muted">Phone</dt>
                <dd>{project.buyer.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-sb-muted">Mailing address</dt>
                <dd>{project.buyer.mailingAddress ?? "—"}</dd>
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
                <span className="font-medium">{access.user.name}</span>
                {access.role ? (
                  <span className="ml-2 text-xs text-sb-muted">
                    {access.role.replace(/_/g, " ")}
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
          <form
            action={assignSubcontractorAction}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <FormField label="Subcontractor" className="sm:col-span-2">
              <Select name="userId" required defaultValue="">
                <option value="" disabled>
                  Select subcontractor
                </option>
                {subcontractors.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit">Assign to project</Button>
            </div>
          </form>
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
                href={`/api/files/${completionDoc.filePath}`}
                className="text-sb-ink underline hover:text-sb-orange"
                target="_blank"
                rel="noreferrer"
              >
                {completionDoc.fileName}
              </a>
            </div>
          ) : null}
          <form
            action={uploadCompletionDocumentAction}
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
            <Button type="submit">Upload for CEO approval</Button>
          </form>
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
