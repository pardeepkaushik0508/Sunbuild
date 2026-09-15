import { Priority, Role } from "@prisma/client";
import { createRfiAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function SubRfisPage() {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const projectIds = await getAccessibleProjectIds(session);

  const [projects, rfis, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.rFI.findMany({
      where: {
        projectId: { in: projectIds },
        createdById: session.user.id,
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: session.user.id,
      },
      select: { id: true, title: true, projectId: true },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="RFIs"
        description="Submit requests for information on your assigned jobs"
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No assigned projects"
          description="You can create RFIs only for jobs you are assigned to."
        />
      ) : (
        <Card className="mb-6">
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Create RFI
          </h2>
          <ActionForm
            action={createRfiAction}
            successMessage="RFI submitted"
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <FormField label="Project">
              <Select name="projectId" required defaultValue="">
                <option value="" disabled>
                  Select assigned project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Priority">
              <Select name="priority" defaultValue={Priority.MEDIUM}>
                {Object.values(Priority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="RFI title" className="md:col-span-2">
              <Input name="title" required />
            </FormField>
            <FormField label="Question" className="md:col-span-2">
              <Textarea name="question" required />
            </FormField>
            <FormField label="Description" className="md:col-span-2">
              <Textarea name="description" placeholder="Additional context (optional)" />
            </FormField>
            <FormField label="Linked task">
              <Select name="taskId" defaultValue="">
                <option value="">None</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Due date">
              <Input name="dueDate" type="date" />
            </FormField>
            <div className="md:col-span-2">
              <SubmitButton pendingLabel="Submitting…">Submit RFI</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      {rfis.length === 0 ? (
        <EmptyState title="No RFIs submitted yet" />
      ) : (
        <div className="space-y-3">
          {rfis.map((rfi) => (
            <Card key={rfi.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{rfi.title}</p>
                  <p className="mt-1 text-sm text-sb-muted">
                    {rfi.project.name} · {formatDate(rfi.createdAt)}
                  </p>
                </div>
                <StatusBadge tone={statusTone(rfi.status)}>
                  {rfi.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{rfi.question}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
