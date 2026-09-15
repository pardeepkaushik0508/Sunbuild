import Link from "next/link";
import { PhotoVisibility, Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { ProjectPhotoGallery } from "@/components/client/project-photo-gallery";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";

export default async function ClientPhotosPage({
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
        description="Progress photos will appear once your home is linked."
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

  const photos = await prisma.photo.findMany({
    where: {
      projectId: project.id,
      visibility: PhotoVisibility.CLIENT_VISIBLE,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={project.id}
      />
      <PageHeader
        title="Photos"
        description="Progress photos shared by your project manager"
        actions={
          <Link href={`/client?projectId=${project.id}`}>
            <Button variant="outline" size="sm">
              My home
            </Button>
          </Link>
        }
      />

      <ProjectPhotoGallery
        title="Project Photos"
        cap={100}
        photos={photos.map((photo) => ({
          id: photo.id,
          src: photo.filePath,
          alt: photo.caption ?? photo.fileName,
          caption: photo.caption ?? photo.fileName,
          createdAt: photo.publishedAt ?? photo.createdAt,
        }))}
      />
    </div>
  );
}
