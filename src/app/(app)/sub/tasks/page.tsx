import { Prisma, Role, TaskStatus } from "@prisma/client";
import Link from "next/link";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    date?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 25;

function dayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export default async function SubAssignedTasksPage({ searchParams }: PageProps) {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const sp = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const q = sp.q?.trim() ?? "";
  const status = sp.status as TaskStatus | undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const dateFilter: Prisma.TaskWhereInput[] = [];
  if (sp.date) {
    const { start, end } = dayRange(sp.date);
    dateFilter.push({
      OR: [
        { dueDate: { gte: start, lt: end } },
        { startDate: { gte: start, lt: end } },
      ],
    });
  } else if (sp.from || sp.to) {
    const range: Prisma.DateTimeFilter = {};
    if (sp.from) range.gte = new Date(`${sp.from}T00:00:00`);
    if (sp.to) {
      const end = new Date(`${sp.to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      range.lt = end;
    }
    dateFilter.push({
      OR: [{ dueDate: range }, { startDate: range }],
    });
  }

  const where: Prisma.TaskWhereInput = {
    assigneeId: session.user.id,
    projectId: { in: projectIds },
    ...(status && Object.values(TaskStatus).includes(status)
      ? { status }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
            { project: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(dateFilter.length ? { AND: dateFilter } : {}),
  };

  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, municipalAddress: true },
        },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (sp.date) qs.set("date", sp.date);
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);

  return (
    <div>
      <PageHeader
        title="Assigned Tasks"
        description="Tasks assigned to you on your jobs"
      />

      <Card className="mb-6">
        <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-6" method="get">
          <FormField label="Search" className="lg:col-span-2">
            <Input name="q" defaultValue={q} placeholder="Title, description, project" />
          </FormField>
          <FormField label="Status">
            <Select name="status" defaultValue={status ?? ""}>
              <option value="">All</option>
              {Object.values(TaskStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Single date">
            <Input name="date" type="date" defaultValue={sp.date ?? ""} />
          </FormField>
          <FormField label="From">
            <Input name="from" type="date" defaultValue={sp.from ?? ""} />
          </FormField>
          <FormField label="To">
            <Input name="to" type="date" defaultValue={sp.to ?? ""} />
          </FormField>
          <div className="flex items-end gap-2 lg:col-span-6">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Link href="/sub/tasks">
              <Button type="button" size="sm" variant="outline">
                Clear
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState
          title="No assigned tasks"
          description="No tasks match these filters."
        />
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <Card key={task.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{task.title}</h3>
                  <p className="mt-1 text-sm text-sb-muted">
                    {task.project.name}
                    {task.project.municipalAddress
                      ? ` · ${task.project.municipalAddress}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(task.status)}>
                    {task.status.replace(/_/g, " ")}
                  </StatusBadge>
                  <StatusBadge tone={statusTone(task.priority)}>
                    {task.priority}
                  </StatusBadge>
                </div>
              </div>
              {task.description ? (
                <p className="mt-3 whitespace-pre-wrap text-sm">{task.description}</p>
              ) : (
                <p className="mt-3 text-sm text-sb-muted">No description.</p>
              )}
              {task.notes ? (
                <p className="mt-2 text-sm text-sb-muted">
                  Instructions: {task.notes}
                </p>
              ) : null}
              <dl className="mt-4 grid gap-2 text-xs text-sb-muted sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt>Start</dt>
                  <dd className="text-sb-ink">{formatDate(task.startDate)}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd className="text-sb-ink">{formatDate(task.dueDate)}</dd>
                </div>
                <div>
                  <dt>Assigned by</dt>
                  <dd className="text-sb-ink">{task.createdBy.name}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd className="text-sb-ink">{formatDate(task.updatedAt)}</dd>
                </div>
              </dl>
              <Link
                href={`/sub/jobs/${task.projectId}`}
                className="mt-3 inline-block text-sm text-sb-muted hover:text-sb-ink"
              >
                Open job →
              </Link>
            </Card>
          ))}
          {totalPages > 1 ? (
            <p className="text-sm text-sb-muted">
              Page {page} of {totalPages} · {total} tasks
              {page < totalPages ? (
                <>
                  {" "}
                  <Link
                    className="underline"
                    href={`/sub/tasks?${qs.toString()}&page=${page + 1}`}
                  >
                    Next
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
