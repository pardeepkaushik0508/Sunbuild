import Link from "next/link";
import { PhotoVisibility, Role } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
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
    include: { project: { select: { name: true } } },
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

      {photos.length === 0 ? (
        <EmptyState
          title="No photos yet"
          description="When your project manager uploads progress photos, they will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <Card key={photo.id} className="overflow-hidden p-0">
              <a
                href={`/api/files/${photo.filePath}`}
                target="_blank"
                rel="noreferrer"
                className="block aspect-video bg-sb-canvas"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${photo.filePath}`}
                  alt={photo.caption ?? photo.fileName}
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="p-4">
                <p className="font-medium">{photo.caption ?? photo.fileName}</p>
                <p className="mt-1 text-xs text-sb-muted">
                  {photo.project.name}
                  {photo.publishedAt
                    ? ` · ${formatDate(photo.publishedAt)}`
                    : ` · ${formatDate(photo.createdAt)}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
