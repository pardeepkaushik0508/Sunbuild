import Link from "next/link";
import { Role } from "@prisma/client";
import { createDailyLogAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMDailyLogsPage({ searchParams }: PageProps) {
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

  const [logs, projects] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { projectId: { in: filteredIds } },
      include: {
        project: { select: { name: true } },
        author: { select: { name: true } },
      },
      orderBy: { logDate: "desc" },
      take: 100,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Daily Logs"
        description="Site activity and notes"
        actions={
          filterProjectId ? (
            <Link href="/pm/daily-logs">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Create daily log
        </h2>
        <form
          action={createDailyLogAction}
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
          <FormField label="Log date">
            <Input name="logDate" type="date" defaultValue={today} required />
          </FormField>
          <FormField label="Weather">
            <Input name="weather" />
          </FormField>
          <FormField label="Workforce">
            <Input name="workforce" placeholder="Crew count, trades on site" />
          </FormField>
          <FormField label="Work completed" className="md:col-span-2">
            <Textarea name="workCompleted" />
          </FormField>
          <FormField label="Site notes" className="md:col-span-2">
            <Textarea name="siteNotes" />
          </FormField>
          <FormField label="Issues" className="md:col-span-2">
            <Textarea name="issues" />
          </FormField>
          <div className="md:col-span-2">
            <Button type="submit">Save log</Button>
          </div>
        </form>
      </Card>

      {logs.length === 0 ? (
        <EmptyState title="No daily logs" />
      ) : (
        <DataTable headers={["Date", "Project", "Author", "Work completed", "Issues"]}>
          {logs.map((log) => (
            <tr key={log.id}>
              <Td className="whitespace-nowrap">{formatDate(log.logDate)}</Td>
              <Td>{log.project.name}</Td>
              <Td>{log.author.name}</Td>
              <Td className="max-w-xs truncate">{log.workCompleted ?? "—"}</Td>
              <Td className="max-w-xs truncate">{log.issues ?? "—"}</Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
