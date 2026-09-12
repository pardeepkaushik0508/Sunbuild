import Link from "next/link";
import { Priority, Role, TaskStatus } from "@prisma/client";
import { createTaskAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { resolveTaskDisplayStatus } from "@/lib/schedule/display-status";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { formatDate, fullName } from "@/lib/utils";
import { PmProjectPicker } from "@/components/pm/project-picker";
import { EditTaskButton } from "@/components/pm/edit-task-button";
import { TaskStatusSelect } from "@/components/pm/task-status-select";

async function createTaskFormAction(form: FormData) {
  "use server";
  await createTaskAction(form);
}

type PageProps = {
  searchParams: Promise<{
    projectId?: string;
    q?: string;
    status?: string;
    priority?: string;
  }>;
};

export default async function PMTasksPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const sp = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filterProjectId = await getSelectedProjectId(session, sp.projectId);
  const q = sp.q?.trim();
  const scopedIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const [tasks, projects, assignees] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId: { in: scopedIds },
        ...(sp.status && Object.values(TaskStatus).includes(sp.status as TaskStatus)
          ? { status: sp.status as TaskStatus }
          : {}),
        ...(sp.priority &&
        Object.values(Priority).includes(sp.priority as Priority)
          ? { priority: sp.priority as Priority }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { description: { contains: q } },
                { project: { name: { contains: q } } },
                { assignee: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 500,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        name: true,
        municipalAddress: true,
        status: true,
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.membership.findMany({
      where: {
        companyId: session.membership.companyId,
        isActive: true,
        role: Role.SUBCONTRACTOR,
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const assigneeOptions = assignees.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }));

  function toLocalDateInput(d: Date | null | undefined) {
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="To-Dos / Task Management"
        description={
          filterProjectId
            ? "Tasks for the selected project"
            : "Tasks across accessible projects"
        }
      />

      <Card>
        <PmProjectPicker
          compact
          selectedProjectId={filterProjectId}
          returnTo="/pm/tasks"
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            municipalAddress: p.municipalAddress,
            status: p.status,
            buyerName: p.buyer
              ? fullName(p.buyer.firstName, p.buyer.lastName)
              : null,
          }))}
        />
      </Card>

      <Card>
        <form
          method="get"
          className="grid gap-3 md:grid-cols-4 md:items-end"
        >
          {filterProjectId ? (
            <input type="hidden" name="projectId" value={filterProjectId} />
          ) : null}
          <FormField label="Search tasks" className="md:col-span-2">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Title, project, assignee…"
            />
          </FormField>
          <FormField label="Status">
            <Select name="status" defaultValue={sp.status ?? ""}>
              <option value="">All</option>
              {Object.values(TaskStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Priority">
            <Select name="priority" defaultValue={sp.priority ?? ""}>
              <option value="">All</option>
              {Object.values(Priority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="md:col-span-4">
            <Button type="submit" variant="outline">
              Apply filters
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-sb-ink">Add Task</h2>
        <ActionForm
          action={createTaskFormAction}
          successMessage="Task created"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project" required>
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
          <FormField label="Title" required>
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
          <FormField label="Subcontractor">
            <Select name="assigneeId" defaultValue="">
              <option value="">Unassigned</option>
              {assignees.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Start date">
            <Input name="startDate" type="date" />
          </FormField>
          <FormField label="Due date">
            <Input name="dueDate" type="date" />
          </FormField>
          <FormField label="Description" className="md:col-span-2">
            <Textarea name="description" />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Creating…">Create task</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks match"
          description="Create a task or clear filters."
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search tasks…"
          emptyMessage="No tasks match your search"
          columns={[
            { key: "task", label: "Task" },
            { key: "project", label: "Project" },
            { key: "assignee", label: "Subcontractor" },
            { key: "priority", label: "Priority" },
            { key: "due", label: "Due" },
            { key: "status", label: "Status", sortable: false },
          ]}
          rows={tasks.map((task) => {
            const displayStatus = resolveTaskDisplayStatus(
              task.status,
              task.dueDate
            );
            return {
              id: task.id,
              searchText: [
                task.title,
                task.description,
                task.project.name,
                task.assignee?.name,
                task.priority,
                displayStatus,
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                task: task.title,
                project: task.project.name,
                assignee: task.assignee?.name ?? "",
                priority: task.priority,
                due: task.dueDate?.getTime() ?? 0,
                status: task.status,
              },
              cells: [
                <Td key="task">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{task.title}</p>
                      {task.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-sb-muted">
                          {task.description}
                        </p>
                      ) : null}
                    </div>
                    <EditTaskButton
                      task={{
                        id: task.id,
                        title: task.title,
                        description: task.description,
                        projectId: task.project.id,
                        priority: task.priority,
                        status: task.status,
                        assigneeId: task.assigneeId,
                        startDate: toLocalDateInput(task.startDate),
                        dueDate: toLocalDateInput(task.dueDate),
                      }}
                      projects={projectOptions}
                      assignees={assigneeOptions}
                    />
                  </div>
                </Td>,
                <Td key="project">
                  <Link
                    href={`/pm/projects/${task.project.id}`}
                    className="hover:underline"
                  >
                    {task.project.name}
                  </Link>
                </Td>,
                <Td key="assignee">{task.assignee?.name ?? "—"}</Td>,
                <Td key="priority">
                  <StatusBadge tone={statusTone(task.priority)}>
                    {task.priority}
                  </StatusBadge>
                </Td>,
                <Td key="due">{formatDate(task.dueDate)}</Td>,
                <Td key="status">
                  <TaskStatusSelect taskId={task.id} status={task.status} />
                </Td>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}
