import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, SelectionSectionStatus } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { ProjectPhotoGallery } from "@/components/client/project-photo-gallery";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getClientVisibleSectionIds,
  getSelectionImagesBySectionIds,
} from "@/lib/selections/query";

export default async function ClientSelectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await requireRole(Role.CLIENT);
  const { id } = await params;
  const sp = await searchParams;
  const project = await resolveClientProject(session, sp.projectId);

  if (!project) {
    return (
      <EmptyState
        title="No project assigned"
        description="Selections will appear once your home is linked."
      />
    );
  }

  const visibleIds = await getClientVisibleSectionIds([project.id]);
  if (!visibleIds.includes(id)) notFound();

  const section = await prisma.selectionSection.findFirst({
    where: {
      id,
      package: { projectId: project.id },
    },
    include: {
      package: { select: { title: true, projectId: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!section) notFound();

  const imageRows = await getSelectionImagesBySectionIds([section.id]);
  const photos = [
    ...imageRows.map((img) => ({
      id: img.id,
      src: img.filePath,
      alt: img.caption || section.name,
      caption: img.caption,
      createdAt: img.createdAt,
    })),
    ...section.items
      .filter((item) => item.imageUrl)
      .map((item) => ({
        id: `item-${item.id}`,
        src: item.imageUrl as string,
        alt: item.label,
        caption: item.label,
        createdAt: item.updatedAt,
      })),
  ];

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={[{ id: project.id, name: project.name }]}
        activeProjectId={project.id}
      />
      <PageHeader
        title={section.name}
        description={section.package.title}
        actions={
          <Link href={`/client/selections?projectId=${project.id}`}>
            <Button variant="outline" size="sm">
              All selections
            </Button>
          </Link>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(section.status)}>
            {section.status.replace(/_/g, " ")}
          </StatusBadge>
          {section.allowance != null ? (
            <span className="text-sm text-sb-muted">
              Allowance {formatCurrency(section.allowance)}
            </span>
          ) : null}
          {section.dueDate ? (
            <span className="text-sm text-sb-muted">
              Due {formatDate(section.dueDate)}
            </span>
          ) : null}
        </div>
        {section.notes ? (
          <p className="mt-3 text-sm text-sb-muted">{section.notes}</p>
        ) : null}
      </Card>

      <ProjectPhotoGallery
        title="Selection images"
        cap={24}
        photos={photos}
        emptyDescription="No images have been shared for this selection yet."
      />

      <Card>
        <h2 className="text-base font-semibold">Options</h2>
        {section.items.length === 0 ? (
          <p className="mt-2 text-sm text-sb-muted">No options yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {section.items.map((item) => (
              <li
                key={item.id}
                className="rounded-[10px] border border-sb-border px-3 py-2 text-sm"
              >
                <p className="font-medium">{item.label}</p>
                <p className="text-sb-muted">
                  {item.optionValue || item.notes || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
        {section.status === SelectionSectionStatus.LOCKED ||
        section.status === SelectionSectionStatus.APPROVED ? (
          <p className="mt-3 text-xs text-sb-muted">This selection is approved.</p>
        ) : null}
      </Card>
    </div>
  );
}
