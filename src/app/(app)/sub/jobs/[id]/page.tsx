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
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

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
      take: 20,
    }),
  ]);

  if (!project) notFound();

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
          {project.progressPercent}% complete
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
                    <form
                      action={updateTaskStatusAction.bind(
                        null,
                        task.id,
                        TaskStatus.DONE
                      )}
                      className="mt-2"
                    >
                      <Button type="submit" size="sm" variant="outline">
                        Mark done
                      </Button>
                    </form>
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
                  <form
                    action={answerRfiAction.bind(null, rfi.id)}
                    className="mt-3 space-y-2"
                  >
                    <FormField label="Response">
                      <Textarea name="response" required />
                    </FormField>
                    <Button type="submit" size="sm">
                      Submit answer
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Daily log
          </h2>
          <form action={createDailyLogAction} className="mt-4 space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <FormField label="Log date">
              <Input name="logDate" type="date" defaultValue={today} required />
            </FormField>
            <FormField label="Work completed">
              <Textarea name="workCompleted" />
            </FormField>
            <FormField label="Site notes">
              <Textarea name="siteNotes" />
            </FormField>
            <FormField label="Issues">
              <Textarea name="issues" />
            </FormField>
            <Button type="submit" size="sm">
              Save log
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Upload photo
          </h2>
          <form
            action={uploadPhotoAction}
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
            <Button type="submit" size="sm">
              Upload (internal only)
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Documents
        </h2>
        {documents.length === 0 ? (
          <p className="mt-4 text-sm text-sb-muted">No documents.</p>
        ) : (
          <DataTable headers={["Title", "Category", "Uploaded", "File"]}>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <Td className="font-medium">{doc.title}</Td>
                <Td>{doc.category}</Td>
                <Td>
                  {doc.uploadedBy.name}
                  <p className="text-xs text-sb-muted">{formatDate(doc.createdAt)}</p>
                </Td>
                <Td>
                  <a
                    href={`/api/files/${doc.filePath}`}
                    className="text-sm underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.fileName}
                  </a>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
