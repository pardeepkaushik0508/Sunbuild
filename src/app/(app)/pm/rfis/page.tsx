import Link from "next/link";
import { Priority, Role, RfiStatus } from "@prisma/client";
import { createRfiAction, answerRfiAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMRfisPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { projectId: paramProjectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filterProjectId = await getSelectedProjectId(session, paramProjectId);
  const filteredIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const [rfis, projects, assignees] = await Promise.all([
    prisma.rFI.findMany({
      where: { projectId: { in: filteredIds } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.membership.findMany({
      where: {
        companyId: session.membership.companyId,
        isActive: true,
        role: { in: [Role.PROJECT_MANAGER, Role.SUBCONTRACTOR] },
      },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="RFIs"
        description="Requests for information"
        actions={
          filterProjectId ? (
            <Link href="/pm/rfis">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Create RFI
        </h2>
        <form action={createRfiAction} className="mt-4 grid gap-4 md:grid-cols-2">
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
          <FormField label="Title">
            <Input name="title" required />
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
          <FormField label="Assignee">
            <Select name="assigneeId" defaultValue="">
              <option value="">Unassigned</option>
              {assignees.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Due date">
            <Input name="dueDate" type="date" />
          </FormField>
          <FormField label="Question" className="md:col-span-2">
            <Textarea name="question" required />
          </FormField>
          <div className="md:col-span-2">
            <Button type="submit">Create RFI</Button>
          </div>
        </form>
      </Card>

      {rfis.length === 0 ? (
        <EmptyState title="No RFIs" />
      ) : (
        <div className="space-y-6">
          {rfis.map((rfi) => (
            <Card key={rfi.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-sb-black">{rfi.title}</h3>
                  <p className="mt-1 text-sm text-sb-muted">
                    {rfi.project.name} · {rfi.createdBy.name} ·{" "}
                    {formatDate(rfi.createdAt)}
                  </p>
                </div>
                <StatusBadge tone={statusTone(rfi.status)}>
                  {rfi.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm text-sb-ink">{rfi.question}</p>
              {rfi.response ? (
                <div className="mt-3 rounded-[10px] bg-sb-canvas/60 px-4 py-3 text-sm">
                  <p className="font-medium text-sb-muted">Response</p>
                  <p className="mt-1">{rfi.response}</p>
                  {rfi.answeredAt ? (
                    <p className="mt-1 text-xs text-sb-muted">
                      Answered {formatDate(rfi.answeredAt)}
                    </p>
                  ) : null}
                </div>
              ) : rfi.status !== RfiStatus.ANSWERED &&
                rfi.status !== RfiStatus.CLOSED ? (
                <form
                  action={answerRfiAction.bind(null, rfi.id)}
                  className="mt-4 space-y-3"
                >
                  <FormField label="Answer">
                    <Textarea name="response" required />
                  </FormField>
                  <Button type="submit" size="sm">
                    Submit answer
                  </Button>
                </form>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
