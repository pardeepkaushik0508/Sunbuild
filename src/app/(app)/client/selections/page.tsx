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
import {
  CLIENT_SELECTION_PACKAGE_STATUS_WHERE,
  getClientVisibleSectionIds,
  getSelectionImagesBySectionIds,
  idInFilter,
} from "@/lib/selections/query";

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

  const visibleSectionIds = await getClientVisibleSectionIds([project.id]);
  const visibleSectionFilter = idInFilter(visibleSectionIds);

  const packages = await prisma.selectionPackage.findMany({
    where: {
      projectId: project.id,
      ...CLIENT_SELECTION_PACKAGE_STATUS_WHERE,
      sections: { some: visibleSectionFilter },
    },
    include: {
      sections: {
        where: visibleSectionFilter,
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const sectionIds = packages.flatMap((p) => p.sections.map((s) => s.id));
  const imageRows = await getSelectionImagesBySectionIds(sectionIds);
  const imagesBySection = new Map<string, typeof imageRows>();
  for (const img of imageRows) {
    const list = imagesBySection.get(img.sectionId) ?? [];
    list.push(img);
    imagesBySection.set(img.sectionId, list);
  }

  const cards = packages.flatMap((pkg) =>
    pkg.sections.map((section) => {
      const fields = selectionClientFields(section);
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

      const extraImages = imagesBySection.get(section.id) ?? [];
      const images = [
        ...extraImages.map((img) => ({
          id: img.id,
          src: img.filePath,
          alt: img.caption || section.name,
        })),
        ...section.items
          .filter((item) => item.imageUrl)
          .map((item) => ({
            id: `item-${item.id}`,
            src: item.imageUrl as string,
            alt: item.label,
          })),
      ];

      return {
        id: section.id,
        name: section.name,
        category:
          "category" in section && typeof section.category === "string"
            ? section.category
            : null,
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
        href: `/client/selections/${section.id}?projectId=${project.id}`,
        images,
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
