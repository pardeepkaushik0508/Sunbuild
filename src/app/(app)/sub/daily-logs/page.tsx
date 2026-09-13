import Link from "next/link";
import { Role } from "@prisma/client";
import { createDailyLogAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { MediaImage } from "@/components/ui/media-image";
import { Button } from "@/components/ui/button";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function SubDailyLogsPage({ searchParams }: PageProps) {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const { projectId: paramProjectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);

  const [projects, logs] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.dailyLog.findMany({
      where: {
        authorId: session.user.id,
        ...(paramProjectId && projectIds.includes(paramProjectId)
          ? { projectId: paramProjectId }
          : { projectId: { in: projectIds } }),
      },
      include: {
        project: { select: { id: true, name: true } },
        photos: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { logDate: "desc" },
      take: 500,
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const selectedProjectId =
    paramProjectId && projectIds.includes(paramProjectId)
      ? paramProjectId
      : projects[0]?.id ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Logs"
        description="Submit your daily progress and site notes for assigned projects"
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No assigned projects"
          description="You can only submit daily logs once you are assigned to an active project."
        />
      ) : (
        <Card className="mb-6">
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Submit daily log
          </h2>
          <ActionForm
            action={createDailyLogAction}
            successMessage="Daily log submitted successfully"
            encType="multipart/form-data"
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <FormField label="Assigned project">
              <Select
                name="projectId"
                required
                defaultValue={selectedProjectId}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Log date">
              <Input name="logDate" type="date" defaultValue={today} required />
            </FormField>
            <FormField label="Work completed" className="md:col-span-2">
              <Textarea
                name="workCompleted"
                required
                placeholder="Describe tasks completed, trades performed, and installations finished today..."
              />
            </FormField>
            <FormField label="Site notes" className="md:col-span-2">
              <Textarea
                name="siteNotes"
                placeholder="Site conditions, safety notes, or remarks..."
              />
            </FormField>
            <div className="md:col-span-2">
              <ImageUploadField
                name="photos"
                multiple
                label="Photos (optional)"
                maxFiles={10}
              />
            </div>
            <div className="md:col-span-2">
              <SubmitButton pendingLabel="Submitting…">Submit log</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      <div>
        <h3 className="mb-3 font-[family-name:var(--font-outfit)] text-base font-semibold text-sb-black">
          My submitted logs
        </h3>
        {logs.length === 0 ? (
          <EmptyState
            title="No daily logs submitted yet"
            description="Use the form above to record your site activity."
          />
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <Card key={log.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <Link
                        href={`/sub/daily-logs/${log.id}`}
                        className="hover:underline"
                      >
                        {formatDate(log.logDate)} · {log.project.name}
                      </Link>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-sb-text">
                      {log.workCompleted ?? "—"}
                    </p>
                    {log.siteNotes ? (
                      <p className="mt-1 line-clamp-2 text-sm text-sb-muted">
                        {log.siteNotes}
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <Link href={`/sub/daily-logs/${log.id}`}>
                        <Button variant="outline" size="sm">
                          View details
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <StatusBadge tone="green">{log.status}</StatusBadge>
                </div>
                {log.photos.length > 0 ? (
                  <Link
                    href={`/sub/daily-logs/${log.id}`}
                    className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
                  >
                    {log.photos.slice(0, 4).map((photo) => (
                      <span
                        key={photo.id}
                        className="block overflow-hidden rounded-[8px]"
                      >
                        <MediaImage
                          src={photo.filePath}
                          alt={photo.fileName}
                          aspectClassName="aspect-square"
                          width={240}
                          height={240}
                        />
                      </span>
                    ))}
                  </Link>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
