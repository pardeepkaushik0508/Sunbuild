import { Role, SelectionSectionStatus } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { ClientSelectionsBoard } from "@/components/client/selections-board";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";
import { computeAllowanceUsage } from "@/lib/client/allowance";
import { resolveDueBadge } from "@/lib/client/due";
import { selectionClientFields } from "@/lib/client/selection-fields";
import { whatsappLink } from "@/lib/utils";

export default async function ClientSelectionsPage({
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
        description="Selections will appear once your home is linked."
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

  const packages = await prisma.selectionPackage.findMany({
    where: {
      projectId: project.id,
      status: { not: "DRAFT" },
    },
    include: {
      sections: {
        include: { items: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const fallbackPackages =
    packages.length > 0
      ? packages
      : await prisma.selectionPackage.findMany({
          where: { projectId: project.id },
          include: {
            sections: {
              include: { items: true },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        });

  const sectionIds = fallbackPackages.flatMap((p) =>
    p.sections.map((s) => s.id)
  );
  const metaRows =
    sectionIds.length === 0
      ? []
      : await prisma.$queryRawUnsafe<
          Array<{ id: string; dueDate: string | Date | null; priority: string | null }>
        >(
          `SELECT id, dueDate, priority FROM SelectionSection WHERE id IN (${sectionIds
            .map(() => "?")
            .join(",")})`,
          ...sectionIds
        ).catch(() => [] as Array<{
          id: string;
          dueDate: string | Date | null;
          priority: string | null;
        }>);

  const metaById = new Map(metaRows.map((r) => [r.id, r]));

  const cards = fallbackPackages.flatMap((pkg) =>
    pkg.sections.map((section) => {
      const meta = metaById.get(section.id);
      const fields = selectionClientFields({
        ...section,
        dueDate: meta?.dueDate ?? null,
        priority: meta?.priority ?? "MEDIUM",
      });
      const usage = computeAllowanceUsage({
        sectionAllowance: section.allowance,
        items: section.items,
      });
      const dueBadge = resolveDueBadge(fields.dueDate, {
        isSettled:
          section.status === SelectionSectionStatus.LOCKED ||
          section.status === SelectionSectionStatus.APPROVED,
      });
      const canApprove =
        section.status !== SelectionSectionStatus.LOCKED &&
        section.status !== SelectionSectionStatus.APPROVED &&
        section.status !== SelectionSectionStatus.SUBMITTED;

      const ask = whatsappLink(
        project.pm?.phone,
        `Hi ${project.pm?.name ?? "PM"}, I have a question about selection "${section.name}" on ${project.name}.`
      );

      return {
        id: section.id,
        name: section.name,
        description: section.notes,
        priority: fields.priority,
        status: section.status,
        dueDate: fields.dueDate?.toISOString() ?? null,
        dueBadge,
        allowancePercent: usage.percent,
        selected: usage.selected,
        allowance: usage.allowance,
        packageTitle: pkg.title,
        askQuestionHref: ask,
        canApprove,
      };
    })
  );

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={project.id}
      />
      <PageHeader
        title="Your Selections"
        description="Review allowances, confirm categories, and message your PM with questions."
      />
      <ClientSelectionsBoard cards={cards} />
    </div>
  );
}
