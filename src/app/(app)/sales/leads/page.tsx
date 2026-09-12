import Link from "next/link";
import { LeadStatus, Prisma, Role } from "@prisma/client";
import { PageHeader, Card } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form";
import { LeadCreateForm } from "@/components/sales/lead-create-form";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ q?: string; stage?: string; filter?: string }>;
};

function stageStatuses(stage?: string): LeadStatus[] | null {
  if (!stage) return null;
  const upper = stage.toUpperCase() as LeadStatus;
  if (upper === LeadStatus.NEW || upper === LeadStatus.CONTACTED) {
    return [LeadStatus.NEW, LeadStatus.CONTACTED];
  }
  if (Object.values(LeadStatus).includes(upper)) return [upper];
  return null;
}

export default async function SalesLeadsPage({ searchParams }: PageProps) {
  const session = await requireRole([Role.SALES_MANAGER, Role.OWNER]);
  const { q, stage, filter } = await searchParams;
  const companyId = session.membership.companyId;
  const query = q?.trim();
  const statuses = stageStatuses(stage);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const staleCutoff = new Date(now);
  staleCutoff.setDate(staleCutoff.getDate() - 14);

  const andFilters: Prisma.LeadWhereInput[] = [];
  if (session.membership.role === Role.SALES_MANAGER) {
    andFilters.push({
      OR: [{ assigneeId: session.user.id }, { assigneeId: null }],
    });
  }
  if (statuses) {
    andFilters.push({ status: { in: statuses } });
  }
  if (filter === "overdue") {
    andFilters.push({
      status: { notIn: [LeadStatus.WON, LeadStatus.LOST] },
      followUpAt: { lt: startOfToday },
    });
  }
  if (filter === "stale") {
    andFilters.push({
      status: { notIn: [LeadStatus.WON, LeadStatus.LOST] },
      updatedAt: { lt: staleCutoff },
    });
  }
  if (query) {
    andFilters.push({
      OR: [
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { email: { contains: query } },
        { phone: { contains: query } },
        { address: { contains: query } },
        { source: { contains: query } },
      ],
    });
  }

  const where: Prisma.LeadWhereInput = {
    companyId,
    ...(andFilters.length ? { AND: andFilters } : {}),
  };

  const [leads, assignees] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.membership.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: [Role.SALES_MANAGER, Role.OWNER] },
      },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const filterLabel =
    filter === "overdue"
      ? "Overdue follow-ups"
      : filter === "stale"
        ? "Stale leads (14+ days)"
        : stage
          ? `Stage: ${stage.replace(/_/g, " ")}`
          : null;

  return (
    <div>
      <PageHeader
        title="Lead Management"
        description="Manage sales pipeline and new opportunities"
      />

      {filterLabel ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-sb-orange-soft px-3 py-1 font-medium text-sb-orange-dark">
            {filterLabel}
          </span>
          <Link href="/sales/leads" className="text-sb-muted hover:underline">
            Clear filter
          </Link>
        </div>
      ) : null}

      <Card className="mb-6">
        <form
          method="get"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}
          <FormField label="Search leads" className="flex-1">
            <Input
              name="q"
              defaultValue={query ?? ""}
              placeholder="Name, email, phone, address, or source"
            />
          </FormField>
          <Button type="submit" variant="outline">
            Search
          </Button>
          {query || stage || filter ? (
            <Link href="/sales/leads">
              <Button variant="ghost">Clear</Button>
            </Link>
          ) : null}
        </form>
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-[#111827]">Create lead</h2>
        <LeadCreateForm
          assignees={assignees.map((m) => ({
            id: m.user.id,
            name: m.user.name,
          }))}
        />
      </Card>

      <InteractiveDataTable
        searchPlaceholder="Search leads…"
        emptyMessage="No leads match this view"
        columns={[
          { key: "lead", label: "Lead" },
          { key: "status", label: "Status" },
          { key: "value", label: "Value" },
          { key: "assignee", label: "Assignee" },
          { key: "updated", label: "Updated" },
          { key: "actions", label: "", sortable: false },
        ]}
        rows={leads.map((lead) => {
          const name = fullName(lead.firstName, lead.lastName);
          return {
            id: lead.id,
            searchText: [
              name,
              lead.email,
              lead.phone,
              lead.status,
              lead.assignee?.name,
            ]
              .filter(Boolean)
              .join(" "),
            sortValues: {
              lead: name,
              status: lead.status,
              value: Number(lead.estimatedValue ?? 0),
              assignee: lead.assignee?.name ?? "Unassigned",
              updated: lead.updatedAt.getTime(),
            },
            cells: [
              <Td key="lead">
                <p className="font-medium">{name}</p>
                <p className="text-xs text-[#6b7280]">
                  {lead.email || lead.phone || "—"}
                </p>
              </Td>,
              <Td key="status">
                <StatusBadge tone={statusTone(lead.status)}>
                  {lead.status.replace(/_/g, " ")}
                </StatusBadge>
              </Td>,
              <Td key="value">{formatCurrency(lead.estimatedValue)}</Td>,
              <Td key="assignee">{lead.assignee?.name || "Unassigned"}</Td>,
              <Td key="updated">{formatDate(lead.updatedAt)}</Td>,
              <Td key="actions">
                <Link
                  href={`/sales/leads/${lead.id}`}
                  className="text-sm font-medium text-[#f97316]"
                >
                  Open
                </Link>
              </Td>,
            ],
          };
        })}
      />
    </div>
  );
}
