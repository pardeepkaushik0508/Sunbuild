import Link from "next/link";
import { Role } from "@prisma/client";
import { createWarrantyTicketAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function ClientWarrantyPage() {
  const session = await requireRole(Role.CLIENT);
  const projectIds = await getAccessibleProjectIds(session);

  const [tickets, projects] = await Promise.all([
    prisma.warrantyTicket.findMany({
      where: {
        projectId: { in: projectIds },
        clientUserId: session.user.id,
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: {
        id: { in: projectIds },
        warrantyStart: { not: null },
        OR: [
          { warrantyEnd: null },
          { warrantyEnd: { gte: new Date() } },
        ],
      },
      select: { id: true, name: true, warrantyEnd: true },
    }),
  ]);

  const warrantyActive = projects.length > 0;

  return (
    <div>
      <PageHeader
        title="Warranty"
        description="Submit and track warranty requests"
        actions={
          <Link href="/client">
            <Button variant="outline" size="sm">
              My home
            </Button>
          </Link>
        }
      />

      {warrantyActive ? (
        <Card className="mb-6">
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Create warranty ticket
          </h2>
          <form
            action={createWarrantyTicketAction}
            encType="multipart/form-data"
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <FormField label="Project">
              <Select name="projectId" required defaultValue="">
                <option value="" disabled>
                  Select project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.warrantyEnd
                      ? ` (until ${formatDate(p.warrantyEnd)})`
                      : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Category">
              <Input name="category" required placeholder="Plumbing, HVAC..." />
            </FormField>
            <FormField label="Title">
              <Input name="title" required />
            </FormField>
            <FormField label="Photo (optional)">
              <Input name="file" type="file" accept="image/*" />
            </FormField>
            <FormField label="Description" className="md:col-span-2">
              <Textarea name="description" required />
            </FormField>
            <div className="md:col-span-2">
              <Button type="submit">Submit ticket</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-sm text-sb-muted">
            Warranty coverage begins after handover and CEO approval.
          </p>
        </Card>
      )}

      {tickets.length === 0 ? (
        <EmptyState title="No warranty tickets" />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/client/warranty/${ticket.id}`}
              className="block rounded-[12px] border border-sb-border bg-white p-4 hover:bg-sb-canvas/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {ticket.ticketNumber} — {ticket.title}
                  </p>
                  <p className="mt-1 text-sm text-sb-muted">
                    {ticket.project.name} · {ticket.category} ·{" "}
                    {formatDate(ticket.createdAt)}
                  </p>
                </div>
                <StatusBadge tone={statusTone(ticket.status)}>
                  {ticket.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
