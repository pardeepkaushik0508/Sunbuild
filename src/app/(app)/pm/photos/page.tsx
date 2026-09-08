import Link from "next/link";
import { PhotoVisibility, Role } from "@prisma/client";
import { uploadPhotoAction, publishPhotoAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMPhotosPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { projectId: filterProjectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filteredIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const [photos, projects] = await Promise.all([
    prisma.photo.findMany({
      where: { projectId: { in: filteredIds } },
      include: {
        project: { select: { name: true } },
        uploadedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Photos"
        description="Site progress photos"
        actions={
          filterProjectId ? (
            <Link href="/pm/photos">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Upload photo
        </h2>
        <form
          action={uploadPhotoAction}
          encType="multipart/form-data"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project">
            <Select
              name="projectId"
              required
              defaultValue={filterProjectId ?? ""}
            >
              <option value="" disabled>
                Select project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Caption">
            <Input name="caption" />
          </FormField>
          <FormField label="Visibility">
            <Select name="visibility" defaultValue={PhotoVisibility.INTERNAL}>
              {Object.values(PhotoVisibility).map((v) => (
                <option key={v} value={v}>
                  {v.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Image">
            <Input name="file" type="file" accept="image/*" required />
          </FormField>
          <div className="md:col-span-2">
            <Button type="submit">Upload</Button>
          </div>
        </form>
      </Card>

      {photos.length === 0 ? (
        <EmptyState title="No photos" />
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
                  {photo.project.name} · {photo.uploadedBy.name} ·{" "}
                  {formatDate(photo.createdAt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(photo.visibility)}>
                    {photo.visibility.replace(/_/g, " ")}
                  </StatusBadge>
                  {photo.visibility === PhotoVisibility.INTERNAL ? (
                    <form action={publishPhotoAction.bind(null, photo.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Publish to client
                      </Button>
                    </form>
                  ) : photo.publishedAt ? (
                    <span className="text-xs text-sb-muted">
                      Published {formatDate(photo.publishedAt)}
                    </span>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
