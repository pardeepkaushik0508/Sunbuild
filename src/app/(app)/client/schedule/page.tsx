import { Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { ClientScheduleBoard } from "@/components/client/schedule-board";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";
import {
  clientScheduleStatusLabel,
  formatDurationDays,
} from "@/lib/client/display";
import { formatDate, whatsappLink } from "@/lib/utils";

export default async function ClientSchedulePage({
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
        description="Your schedule will appear once your home is linked."
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

  const [scheduleItems, milestones] = await Promise.all([
    prisma.scheduleItem.findMany({
      where: { projectId: project.id },
      orderBy: { startDate: "asc" },
    }),
    prisma.milestone.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const items = [
    ...scheduleItems.map((item) => ({
      id: item.id,
      kind: "schedule" as const,
      title: item.title,
      description: item.trade ? `Trade: ${item.trade}` : null,
      dateLabel: formatDate(item.startDate),
      statusLabel: clientScheduleStatusLabel(
        item.status,
        item.startDate,
        item.endDate
      ),
      statusRaw: item.status,
      contractor: item.assigneeName,
      duration: formatDurationDays(item.startDate, item.endDate),
      startDate: item.startDate.toISOString(),
      endDate: item.endDate.toISOString(),
      messagePmHref: whatsappLink(
        project.pm?.phone,
        `Hi ${project.pm?.name ?? "PM"}, regarding schedule item "${item.title}" on ${project.name}`
      ),
    })),
    ...milestones.map((m) => ({
      id: m.id,
      kind: "milestone" as const,
      title: m.title,
      description: m.description,
      dateLabel: formatDate(m.dueDate),
      statusLabel: clientScheduleStatusLabel(m.status, m.dueDate, m.dueDate),
      statusRaw: m.status,
      contractor: null as string | null,
      duration: "—",
      startDate: m.dueDate?.toISOString() ?? null,
      endDate: m.dueDate?.toISOString() ?? null,
      messagePmHref: whatsappLink(
        project.pm?.phone,
        `Hi ${project.pm?.name ?? "PM"}, regarding milestone "${m.title}" on ${project.name}`
      ),
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
        title="Project Schedule"
        description="Read-only view of milestones and scheduled work for your home."
      />
      <ClientScheduleBoard items={items} />
    </div>
  );
}
