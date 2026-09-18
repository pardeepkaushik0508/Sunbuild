import Link from "next/link";
import { Prisma, Role, WarrantyStatus } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    projectId?: string;
    q?: string;
    status?: string;
    category?: string;
    client?: string;
    assignment?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function ServiceWarrantyPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.SERVICE_COORDINATOR,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
  ]);
  const sp = await searchParams;
  const companyId = session.membership.companyId;
  const q = sp.q?.trim() ?? "";
  const status = sp.status as WarrantyStatus | undefined;
  const page = Math.max(1, Number(sp.page || 1));
  const take = 25;
  const skip = (page - 1) * take;

  const where: Prisma.WarrantyTicketWhereInput = {
    project: { companyId, deletedAt: null },
    ...(sp.projectId ? { projectId: sp.projectId } : {}),
    ...(status && Object.values(WarrantyStatus).includes(status)
      ? { status }
      : {}),
    ...(sp.category
      ? { category: { contains: sp.category, mode: "insensitive" as const } }
      : {}),
    ...(sp.client
      ? {
          clientUser: {
            name: { contains: sp.client, mode: "insensitive" as const },
          },
        }
      : {}),
    ...(sp.assignment === "me"
      ? { coordinatorId: session.user.id }
      : sp.assignment === "unassigned"
        ? { coordinatorId: null, pmId: null }
        : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { ticketNumber: { contains: q, mode: "insensitive" } },
            { project: { name: { contains: q, mode: "insensitive" } } },
            { clientUser: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  if (sp.from || sp.to) {
    where.createdAt = {};
    if (sp.from) where.createdAt.gte = new Date(`${sp.from}T00:00:00`);
    if (sp.to) {
      const end = new Date(`${sp.to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      where.createdAt.lt = end;
    }
  }

  const [tickets, total, projects] = await Promise.all([
    prisma.warrantyTicket.findMany({
      where,
      include: {
        project: { select: { name: true } },
        clientUser: { select: { name: true } },
        subcontractor: { select: { name: true } },
        coordinator: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.warrantyTicket.count({ where }),
    prisma.project.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="Warranty & complaints"
        description="Search, triage, and forward client warranty tickets."
      />
      <Card className="mb-6">
        <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-4" method="get">
          <FormField label="Search" className="lg:col-span-2">
            <Input name="q" defaultValue={q} placeholder="Ticket, issue, client" />
          </FormField>
          <FormField label="Project">
            <Select name="projectId" defaultValue={sp.projectId ?? ""}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select name="status" defaultValue={status ?? ""}>
              <option value="">All</option>
              {Object.values(WarrantyStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Client">
            <Input name="client" defaultValue={sp.client ?? ""} />
          </FormField>
          <FormField label="Assignment">
            <Select name="assignment" defaultValue={sp.assignment ?? ""}>
              <option value="">All</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </Select>
          </FormField>
          <FormField label="From">
            <Input name="from" type="date" defaultValue={sp.from ?? ""} />
          </FormField>
          <FormField label="To">
            <Input name="to" type="date" defaultValue={sp.to ?? ""} />
          </FormField>
          <div className="flex items-end gap-2 lg:col-span-4">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Link href="/service/warranty">
              <Button type="button" size="sm" variant="outline">
                Clear
              </Button>
            </Link>
          </div>
        </form>
      </Card>
      {tickets.length === 0 ? (
        <EmptyState title="No warranty tickets" />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/service/warranty/${ticket.id}`}
              className="block rounded-[12px] border border-sb-border bg-white p-4 hover:bg-sb-canvas/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {ticket.ticketNumber} — {ticket.title}
                  </p>
                  <p className="text-xs text-sb-muted">
                    {ticket.project.name} · {ticket.clientUser.name}
                    {ticket.coordinator?.name
                      ? ` · Coord. ${ticket.coordinator.name}`
                      : ""}
                  </p>
                </div>
                <StatusBadge tone={statusTone(ticket.status)}>
                  {ticket.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
            </Link>
          ))}
          {pages > 1 ? (
            <p className="text-center text-xs text-sb-muted">
              Page {page} of {pages} · {total} tickets
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
