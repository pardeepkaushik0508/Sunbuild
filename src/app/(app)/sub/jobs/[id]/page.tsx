import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, RfiStatus, TaskStatus } from "@prisma/client";
import {
  answerRfiAction,
  createDailyLogAction,
  updateTaskStatusAction,
  uploadPhotoAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { loadProgressByProjectIds } from "@/lib/dashboard/sync-project-progress";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SubJobDetailPage({ params }: PageProps) {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);
  if (!projectIds.includes(id)) notFound();

  const userId = session.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const [project, tasks, rfis, documents] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        municipalAddress: true,
        status: true,
        progressPercent: true,
      },
    }),
    prisma.task.findMany({
      where: {
        projectId: id,
        assigneeId: userId,
        status: { notIn: [TaskStatus.CANCELLED] },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.rFI.findMany({
      where: {
        projectId: id,
        assigneeId: userId,
        status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.findMany({
      // Subs only see INTERNAL docs for assigned jobs — never assume all docs are shared
      where: { projectId: id, visibility: "INTERNAL" },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  if (!project) notFound();

  const progressById = await loadProgressByProjectIds([id]);
  const liveProgress = progressById.get(id) ?? project.progressPercent;

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.municipalAddress ?? "Job site"}
        actions={
          <Link href="/sub">
            <Button variant="outline" size="sm">
              All jobs
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(project.status)}>
          {project.status.replace(/_/g, " ")}
        </StatusBadge>
        <span className="text-sm text-sb-muted">
          {liveProgress}% complete
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            My tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="mt-4 text-sm text-sb-muted">No tasks assigned.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className="rounded-[10px] border border-sb-border px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-xs text-sb-muted">
                        Due {formatDate(task.dueDate)}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(task.status)}>
                      {task.status.replace(/_/g, " ")}
                    </StatusBadge>
                  </div>
                  {task.status !== TaskStatus.DONE ? (
                    <ActionForm
                      action={updateTaskStatusAction.bind(
                        null,
                        task.id,
                        TaskStatus.DONE
                      )}
                      successMessage="Task marked done"
                      className="mt-2"
                    >
                      <SubmitButton
                        size="sm"
                        variant="outline"
                        pendingLabel="Saving…"
                      >
                        Mark done
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            RFIs to answer
          </h2>
          {rfis.length === 0 ? (
            <p className="mt-4 text-sm text-sb-muted">No open RFIs.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {rfis.map((rfi) => (
                <div
                  key={rfi.id}
                  className="rounded-[10px] border border-sb-border px-4 py-3"
                >
                  <p className="font-medium text-sm">{rfi.title}</p>
                  <p className="mt-1 text-sm text-sb-muted">{rfi.question}</p>
                  <ActionForm
                    action={answerRfiAction.bind(null, rfi.id)}
                    successMessage="RFI answered"
                    className="mt-3 space-y-2"
                  >
                    <FormField label="Response">
                      <Textarea name="response" required />
                    </FormField>
                    <SubmitButton size="sm" pendingLabel="Submitting…">
                      Submit answer
                    </SubmitButton>
                  </ActionForm>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Daily log
          </h2>
          <ActionForm
            action={createDailyLogAction}
            successMessage="Daily log saved"
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <FormField label="Log date">
              <Input name="logDate" type="date" defaultValue={today} required />
            </FormField>
            <FormField label="Work completed">
              <Textarea name="workCompleted" required placeholder="Describe tasks and work completed today..." />
            </FormField>
            <FormField label="Notes">
              <Textarea name="siteNotes" placeholder="Site observations, access notes, or comments..." />
            </FormField>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save log
            </SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Upload photo
          </h2>
          <ActionForm
            action={uploadPhotoAction}
            successMessage="Photo uploaded"
            encType="multipart/form-data"
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="projectId" value={project.id} />
            <FormField label="Caption">
              <Input name="caption" />
            </FormField>
            <FormField label="Photo">
              <Input name="file" type="file" accept="image/*" required />
            </FormField>
            <SubmitButton size="sm" pendingLabel="Uploading…">
              Upload (internal only)
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Documents
        </h2>
        {documents.length === 0 ? (
          <p className="mt-4 text-sm text-sb-muted">No documents.</p>
        ) : (
          <InteractiveDataTable
            searchPlaceholder="Search documents…"
            emptyMessage="No documents match your search"
            columns={[
              { key: "title", label: "Title" },
              { key: "category", label: "Category" },
              { key: "uploaded", label: "Uploaded" },
              { key: "file", label: "File", sortable: false },
            ]}
            rows={documents.map((doc) => ({
              id: doc.id,
              searchText: [
                doc.title,
                doc.category,
                doc.uploadedBy.name,
                doc.fileName,
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                title: doc.title,
                category: doc.category,
                uploaded: doc.createdAt.getTime(),
              },
              cells: [
                <Td key="title" className="font-medium">
                  {doc.title}
                </Td>,
                <Td key="category">{doc.category}</Td>,
                <Td key="uploaded">
                  {doc.uploadedBy.name}
                  <p className="text-xs text-sb-muted">
                    {formatDate(doc.createdAt)}
                  </p>
                </Td>,
                <Td key="file">
                  <a
                    href={`/api/files/${doc.filePath}`}
                    className="text-sm underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.fileName}
                  </a>
                </Td>,
              ],
            }))}
          />
        )}
      </Card>
    </div>
  );
}
