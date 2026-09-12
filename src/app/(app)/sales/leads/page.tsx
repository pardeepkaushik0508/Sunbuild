import Link from "next/link";
import { LeadStatus, Prisma, Role } from "@prisma/client";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { LeadCreateDialog } from "@/components/sales/lead-create-form";
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

  const assigneeOptions = assignees.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }));

  return (
    <div>
      <PageHeader
        title="Lead Management"
        description="Manage sales pipeline and new opportunities"
        icon={<ClipboardList size={18} />}
        actions={<LeadCreateDialog assignees={assigneeOptions} />}
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

      <InteractiveDataTable
        searchPlaceholder="Search leads…"
        initialQuery={query ?? ""}
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
              lead.source,
              lead.address,
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
                <p className="font-medium text-sb-ink">{name}</p>
                <p className="text-xs text-sb-muted">
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
                  className="text-sm font-medium text-sb-orange hover:underline"
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
