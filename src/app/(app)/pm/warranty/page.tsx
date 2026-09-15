import Link from "next/link";
import { Role, WarrantyStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{
    projectId?: string;
    q?: string;
    status?: string;
    category?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function PMWarrantyPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const sp = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filterProjectId =
    sp.projectId && projectIds.includes(sp.projectId) ? sp.projectId : "";
  const scopedIds = filterProjectId ? [filterProjectId] : projectIds;
  const q = sp.q?.trim() ?? "";
  const status = sp.status as WarrantyStatus | undefined;

  const where: Prisma.WarrantyTicketWhereInput = {
    projectId: { in: scopedIds },
    ...(status && Object.values(WarrantyStatus).includes(status)
      ? { status }
      : {}),
    ...(sp.category
      ? { category: { contains: sp.category, mode: "insensitive" } }
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

  const [tickets, projects] = await Promise.all([
    prisma.warrantyTicket.findMany({
      where,
      include: {
        project: { select: { name: true } },
        clientUser: { select: { name: true } },
        subcontractor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
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
        title="Warranty"
        description="Warranty tickets for projects you manage"
      />

      <Card className="mb-6">
        <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-6" method="get">
          <FormField label="Search" className="lg:col-span-2">
            <Input name="q" defaultValue={q} placeholder="Ticket, issue, client" />
          </FormField>
          <FormField label="Project">
            <Select name="projectId" defaultValue={filterProjectId}>
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
          <FormField label="Category">
            <Input name="category" defaultValue={sp.category ?? ""} />
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
            <Link href="/pm/warranty">
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
              href={`/pm/warranty/${ticket.id}`}
              className="block rounded-[12px] border border-sb-border bg-white p-4 hover:bg-sb-canvas/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {ticket.ticketNumber} — {ticket.title}
                  </p>
                  <p className="mt-1 text-sm text-sb-muted">
                    {ticket.project.name} · {ticket.clientUser.name} ·{" "}
                    {ticket.category} · {formatDate(ticket.createdAt)}
                    {ticket.subcontractor
                      ? ` · ${ticket.subcontractor.name}`
                      : ""}
                  </p>
                </div>
                <StatusBadge tone={statusTone(ticket.status)}>
                  {ticket.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm">{ticket.description}</p>
              <p className="mt-2 text-xs text-sb-muted">
                Updated {formatDate(ticket.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
