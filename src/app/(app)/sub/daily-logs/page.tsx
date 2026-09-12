import Link from "next/link";
import { Role } from "@prisma/client";
import { createDailyLogAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

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
      include: { project: { select: { id: true, name: true } } },
      orderBy: { logDate: "desc" },
      take: 50,
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
          <DataTable headers={["Date", "Project", "Status", "Work Completed", "Notes"]}>
            {logs.map((log) => (
              <tr key={log.id}>
                <Td className="whitespace-nowrap font-medium">{formatDate(log.logDate)}</Td>
                <Td>
                  <Link
                    href={`/sub/jobs/${log.project.id}`}
                    className="hover:underline text-sb-text font-medium"
                  >
                    {log.project.name}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge tone="green">{log.status}</StatusBadge>
                </Td>
                <Td className="max-w-xs truncate">{log.workCompleted ?? "—"}</Td>
                <Td className="max-w-xs truncate text-sb-muted">{log.siteNotes ?? "—"}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
