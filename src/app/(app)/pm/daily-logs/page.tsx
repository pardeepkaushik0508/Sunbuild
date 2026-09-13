import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState, Card } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { MediaImage } from "@/components/ui/media-image";
import { loadProjectSubcontractors } from "@/lib/users/subcontractors";

type PageProps = {
  searchParams: Promise<{ projectId?: string; authorId?: string; date?: string }>;
};

export default async function PMDailyLogsPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
  ]);
  const { projectId: paramProjectId, authorId, date } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filterProjectId = await getSelectedProjectId(session, paramProjectId);

  const whereClause: {
    projectId: { in: string[] };
    authorId?: string;
    logDate?: { gte: Date; lt: Date };
  } = {
    projectId: {
      in: filterProjectId && projectIds.includes(filterProjectId)
        ? [filterProjectId]
        : projectIds,
    },
  };

  if (authorId) {
    whereClause.authorId = authorId;
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    whereClause.logDate = { gte: start, lt: end };
  }

  const [logs, projects, subcontractors] = await Promise.all([
    prisma.dailyLog.findMany({
      where: whereClause,
      include: {
        project: { select: { id: true, name: true } },
        author: { select: { id: true, name: true } },
        photos: { orderBy: { createdAt: "asc" }, take: 6 },
      },
      orderBy: { logDate: "desc" },
      take: 500,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    loadProjectSubcontractors({
      companyId: session.membership.companyId,
      projectIds,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Daily Logs"
        description="Subcontractor site activity and progress reports"
      />

      {/* Filter toolbar */}
      <Card className="mb-6 p-4">
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
          <div>
            <label htmlFor="filter-project" className="block text-xs font-semibold text-sb-muted uppercase tracking-wider mb-1">
              Project
            </label>
            <select
              id="filter-project"
              name="projectId"
              defaultValue={filterProjectId ?? ""}
              className="h-9 w-full rounded-[8px] border border-sb-border bg-white px-3 text-sm text-sb-text"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-sub" className="block text-xs font-semibold text-sb-muted uppercase tracking-wider mb-1">
              Subcontractor
            </label>
            <select
              id="filter-sub"
              name="authorId"
              defaultValue={authorId ?? ""}
              className="h-9 w-full rounded-[8px] border border-sb-border bg-white px-3 text-sm text-sb-text"
            >
              <option value="">All subcontractors</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-date" className="block text-xs font-semibold text-sb-muted uppercase tracking-wider mb-1">
              Date
            </label>
            <input
              id="filter-date"
              type="date"
              name="date"
              defaultValue={date ?? ""}
              className="h-9 w-full rounded-[8px] border border-sb-border bg-white px-3 text-sm text-sb-text"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-9">
              Filter
            </Button>
            {(filterProjectId || authorId || date) && (
              <Link href="/pm/daily-logs">
                <Button type="button" variant="outline" size="sm" className="h-9">
                  Reset
                </Button>
              </Link>
            )}
          </div>
        </form>
      </Card>

      {logs.length === 0 ? (
        <EmptyState
          title="No daily logs found"
          description="Daily logs submitted by subcontractors for their assigned projects will appear here."
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search daily logs…"
          emptyMessage="No daily logs match your search"
          columns={[
            { key: "date", label: "Date" },
            { key: "project", label: "Project" },
            { key: "sub", label: "Subcontractor" },
            { key: "status", label: "Status" },
            { key: "work", label: "Work Completed" },
            { key: "notes", label: "Notes" },
            { key: "photos", label: "Photos", sortable: false },
            { key: "view", label: "", sortable: false },
          ]}
          rows={logs.map((log) => ({
            id: log.id,
            searchText: [
              formatDate(log.logDate),
              log.project.name,
              log.author.name,
              log.status,
              log.workCompleted,
              log.siteNotes,
            ]
              .filter(Boolean)
              .join(" "),
            sortValues: {
              date: log.logDate.getTime(),
              project: log.project.name,
              sub: log.author.name,
              status: log.status,
              work: log.workCompleted ?? "",
              notes: log.siteNotes ?? "",
            },
            cells: [
              <Td key="date" className="whitespace-nowrap font-medium">
                <Link
                  href={`/pm/daily-logs/${log.id}`}
                  className="text-sb-ink hover:underline"
                >
                  {formatDate(log.logDate)}
                </Link>
              </Td>,
              <Td key="project">
                <Link
                  href={`/pm/projects/${log.project.id}`}
                  className="hover:underline text-sb-text font-medium"
                >
                  {log.project.name}
                </Link>
              </Td>,
              <Td key="sub">{log.author.name}</Td>,
              <Td key="status">
                <StatusBadge tone={log.status === "SUBMITTED" ? "green" : "neutral"}>
                  {log.status}
                </StatusBadge>
              </Td>,
              <Td key="work" className="max-w-xs truncate">
                <Link
                  href={`/pm/daily-logs/${log.id}`}
                  className="hover:underline"
                  title={log.workCompleted ?? undefined}
                >
                  {log.workCompleted ?? "—"}
                </Link>
              </Td>,
              <Td key="notes" className="max-w-xs truncate text-sb-muted">
                {log.siteNotes ?? "—"}
              </Td>,
              <Td key="photos">
                {log.photos.length === 0 ? (
                  <span className="text-xs text-sb-muted">—</span>
                ) : (
                  <Link
                    href={`/pm/daily-logs/${log.id}`}
                    className="flex gap-1"
                    title="View all photos"
                  >
                    {log.photos.map((photo) => (
                      <span
                        key={photo.id}
                        className="block h-10 w-10 overflow-hidden rounded"
                      >
                        <MediaImage
                          src={photo.filePath}
                          alt={photo.fileName}
                          aspectClassName="h-10 w-10"
                          width={40}
                          height={40}
                        />
                      </span>
                    ))}
                  </Link>
                )}
              </Td>,
              <Td key="view" className="whitespace-nowrap text-right">
                <Link href={`/pm/daily-logs/${log.id}`}>
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </Link>
              </Td>,
            ],
          }))}
        />
      )}
    </div>
  );
}
