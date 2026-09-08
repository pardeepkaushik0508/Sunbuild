import { Role } from "@prisma/client";
import { PageHeader, EmptyState, Card } from "@/components/ui/card";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await requireRole(Role.CLIENT);
  const sp = await searchParams;
  const project = await resolveClientProject(session, sp.projectId);
  const allIds = await getAccessibleProjectIds(session);

  if (!project) {
    return (
      <EmptyState
        title="No project assigned"
        description="Your calendar will appear once your home is linked."
      />
    );
  }

  const projects =
    allIds.length > 1
      ? await prisma.project.findMany({
          where: { id: { in: allIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [{ id: project.id, name: project.name }];

  const [scheduleItems, milestones, sections, invoices] = await Promise.all([
    prisma.scheduleItem.findMany({
      where: { projectId: project.id },
      select: { id: true, title: true, startDate: true, endDate: true },
    }),
    prisma.milestone.findMany({
      where: { projectId: project.id, dueDate: { not: null } },
      select: { id: true, title: true, dueDate: true },
    }),
    prisma.selectionSection.findMany({
      where: {
        package: { projectId: project.id },
        status: { notIn: ["LOCKED", "APPROVED"] },
      },
      select: { id: true, name: true },
    }),
    prisma.invoice.findMany({
      where: {
        projectId: project.id,
        status: { notIn: ["PAID", "VOID", "DRAFT"] },
        dueDate: { not: null },
      },
      select: { id: true, invoiceNumber: true, dueDate: true },
    }),
  ]);

  // dueDate may exist in DB before Prisma Client regenerate; fetch via raw if needed
  const sectionRows = await prisma.$queryRaw<
    Array<{ id: string; name: string; dueDate: string | Date | null }>
  >`
    SELECT id, name, dueDate FROM SelectionSection
    WHERE packageId IN (SELECT id FROM SelectionPackage WHERE projectId = ${project.id})
      AND status NOT IN ('LOCKED', 'APPROVED')
      AND dueDate IS NOT NULL
  `.catch(() => [] as Array<{ id: string; name: string; dueDate: string | Date | null }>);

  const events = [
    ...scheduleItems.map((s) => ({
      id: `sch-${s.id}`,
      date: s.startDate.toISOString(),
      title: s.title,
      type: "schedule" as const,
      meta: "Schedule",
    })),
    ...milestones.map((m) => ({
      id: `ms-${m.id}`,
      date: m.dueDate!.toISOString(),
      title: m.title,
      type: "milestone" as const,
      meta: "Milestone",
    })),
    ...(sectionRows.length
      ? sectionRows
      : sections.map((s) => ({ ...s, dueDate: null as string | Date | null }))
    )
      .filter((sec) => sec.dueDate)
      .map((sec) => ({
        id: `sel-${sec.id}`,
        date: new Date(sec.dueDate!).toISOString(),
        title: `Selection: ${sec.name}`,
        type: "task" as const,
        meta: "Selection due",
      })),
    ...invoices.map((inv) => ({
      id: `inv-${inv.id}`,
      date: inv.dueDate!.toISOString(),
      title: `Invoice ${inv.invoiceNumber}`,
      type: "deposit" as const,
      meta: "Invoice due",
    })),
  ];

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={project.id}
      />
      <PageHeader
        title="Calendar"
        description="Milestones, schedule phases, selection due dates, and invoice due dates."
      />
      {events.length === 0 ? (
        <EmptyState
          title="No calendar events"
          description="Dates will appear as your team publishes schedule and invoices."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <CalendarWidget
            events={events}
            subtitle="Client-visible project dates"
          />
        </Card>
      )}
    </div>
  );
}
