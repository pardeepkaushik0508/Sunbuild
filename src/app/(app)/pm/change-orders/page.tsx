import Link from "next/link";
import { Role } from "@prisma/client";
import { createChangeOrderAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMChangeOrdersPage({ searchParams }: PageProps) {
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

  const [changeOrders, projects] = await Promise.all([
    prisma.changeOrder.findMany({
      where: { projectId: { in: filteredIds } },
      include: {
        project: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Change Orders"
        description="Track scope and cost changes"
        actions={
          filterProjectId ? (
            <Link href="/pm/change-orders">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Create change order
        </h2>
        <ActionForm
          action={createChangeOrderAction}
          successMessage="Change order submitted"
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
          <FormField label="Title">
            <Input name="title" required />
          </FormField>
          <FormField label="Amount (CAD)">
            <Input name="amount" type="number" step="0.01" required />
          </FormField>
          <FormField label="Schedule impact (days)">
            <Input name="scheduleImpact" type="number" step="1" placeholder="e.g. 5" />
          </FormField>
          <FormField label="Reason">
            <Input name="reason" placeholder="e.g. Client requested material upgrade" />
          </FormField>
          <FormField label="Description" className="md:col-span-2">
            <Textarea name="description" placeholder="Provide full breakdown and justification..." />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Submitting…">
              Submit to client
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {changeOrders.length === 0 ? (
        <EmptyState title="No change orders" />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search change orders…"
          emptyMessage="No change orders match your search"
          columns={[
            { key: "title", label: "Title" },
            { key: "project", label: "Project" },
            { key: "amount", label: "Amount" },
            { key: "impact", label: "Schedule Impact" },
            { key: "status", label: "Status" },
            { key: "created", label: "Created" },
            { key: "client", label: "Client action" },
          ]}
          rows={changeOrders.map((co) => ({
            id: co.id,
            searchText: [
              co.title,
              co.description,
              co.project.name,
              co.status,
              co.createdBy.name,
              co.clientComment,
            ]
              .filter(Boolean)
              .join(" "),
            sortValues: {
              title: co.title,
              project: co.project.name,
              amount: Number(co.amount ?? 0),
              impact: co.scheduleImpact ?? 0,
              status: co.status,
              created: co.createdAt.getTime(),
              client: co.clientActionAt?.getTime() ?? 0,
            },
            cells: [
              <Td key="title">
                <p className="font-medium">{co.title}</p>
                {co.description ? (
                  <p className="mt-0.5 text-xs text-sb-muted">{co.description}</p>
                ) : null}
              </Td>,
              <Td key="project">{co.project.name}</Td>,
              <Td key="amount">{formatCurrency(co.amount)}</Td>,
              <Td key="impact">
                {co.scheduleImpact ? `+${co.scheduleImpact} days` : "—"}
              </Td>,
              <Td key="status">
                <StatusBadge tone={statusTone(co.status)}>
                  {co.status.replace(/_/g, " ")}
                </StatusBadge>
              </Td>,
              <Td key="created">
                {co.createdBy.name}
                <p className="text-xs text-sb-muted">{formatDate(co.createdAt)}</p>
              </Td>,
              <Td key="client">
                {co.clientActionAt ? (
                  <>
                    {formatDate(co.clientActionAt)}
                    {co.clientComment ? (
                      <p className="text-xs text-sb-muted">{co.clientComment}</p>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </Td>,
            ],
          }))}
        />
      )}
    </div>
  );
}
