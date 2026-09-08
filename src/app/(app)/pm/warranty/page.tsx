import Link from "next/link";
import { Role, WarrantyStatus } from "@prisma/client";
import { updateWarrantyStatusAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMWarrantyPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { projectId: filterProjectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filteredIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const [tickets, subcontractors] = await Promise.all([
    prisma.warrantyTicket.findMany({
      where: { projectId: { in: filteredIds } },
      include: {
        project: { select: { name: true } },
        clientUser: { select: { name: true } },
        subcontractor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.membership.findMany({
      where: {
        companyId: session.membership.companyId,
        role: Role.SUBCONTRACTOR,
        isActive: true,
      },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Warranty"
        description="Warranty tickets for your projects"
        actions={
          filterProjectId ? (
            <Link href="/pm/warranty">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
          ) : null
        }
      />

      {tickets.length === 0 ? (
        <EmptyState title="No warranty tickets" />
      ) : (
        <div className="space-y-6">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">
                    {ticket.ticketNumber} — {ticket.title}
                  </h3>
                  <p className="mt-1 text-sm text-sb-muted">
                    {ticket.project.name} · {ticket.clientUser.name} ·{" "}
                    {ticket.category}
                  </p>
                </div>
                <StatusBadge tone={statusTone(ticket.status)}>
                  {ticket.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm">{ticket.description}</p>
              {ticket.resolution ? (
                <p className="mt-2 text-sm text-sb-muted">
                  Resolution: {ticket.resolution}
                </p>
              ) : null}

              <form
                action={updateWarrantyStatusAction.bind(null, ticket.id)}
                className="mt-4 grid gap-4 border-t border-sb-border pt-4 md:grid-cols-2"
              >
                <FormField label="Status">
                  <Select name="status" defaultValue={ticket.status}>
                    {Object.values(WarrantyStatus).map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Assign subcontractor">
                  <Select
                    name="subcontractorId"
                    defaultValue={ticket.subcontractorId ?? ""}
                  >
                    <option value="">Unassigned</option>
                    {subcontractors.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Resolution" className="md:col-span-2">
                  <Textarea
                    name="resolution"
                    defaultValue={ticket.resolution ?? ""}
                  />
                </FormField>
                <FormField label="Comment" className="md:col-span-2">
                  <Input name="comment" placeholder="Internal note..." />
                </FormField>
                <div className="md:col-span-2">
                  <Button type="submit" size="sm">
                    Update ticket
                  </Button>
                </div>
              </form>
              {ticket.closedAt ? (
                <p className="mt-2 text-xs text-sb-muted">
                  Closed {formatDate(ticket.closedAt)}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
