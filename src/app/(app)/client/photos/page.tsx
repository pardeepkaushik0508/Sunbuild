import Link from "next/link";
import { PhotoVisibility, Role } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function ClientPhotosPage() {
  const session = await requireRole(Role.CLIENT);
  const projectIds = await getAccessibleProjectIds(session);

  const photos = await prisma.photo.findMany({
    where: {
      projectId: { in: projectIds },
      visibility: PhotoVisibility.CLIENT_VISIBLE,
    },
    include: { project: { select: { name: true } } },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Photos"
        description="Published progress photos"
        actions={
          <Link href="/client">
            <Button variant="outline" size="sm">
              My home
            </Button>
          </Link>
        }
      />

      {photos.length === 0 ? (
        <EmptyState title="No photos published yet" />
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
                    ? ` · Published ${formatDate(photo.publishedAt)}`
                    : ""}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
