import Link from "next/link";
import { Role, WarrantyStatus } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ServiceOverviewPage() {
  const session = await requireRole([
    Role.SERVICE_COORDINATOR,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
  ]);
  const companyId = session.membership.companyId;

  const [open, inProgress, assigned] = await Promise.all([
    prisma.warrantyTicket.count({
      where: {
        project: { companyId, deletedAt: null },
        status: { in: [WarrantyStatus.OPEN, WarrantyStatus.UNDER_REVIEW] },
      },
    }),
    prisma.warrantyTicket.count({
      where: {
        project: { companyId, deletedAt: null },
        status: { in: [WarrantyStatus.ASSIGNED, WarrantyStatus.IN_PROGRESS] },
      },
    }),
    prisma.warrantyTicket.count({
      where: {
        project: { companyId, deletedAt: null },
        coordinatorId: session.user.id,
        status: { notIn: [WarrantyStatus.CLOSED] },
      },
    }),
  ]);

  const recent = await prisma.warrantyTicket.findMany({
    where: { project: { companyId, deletedAt: null } },
    include: {
      project: { select: { name: true } },
      clientUser: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Service coordination"
        description="Triage client complaints and warranty tickets. Finance and user administration are not included."
        actions={
          <Link href="/service/warranty">
            <Button size="sm">All tickets</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-sb-muted">Needs triage</p>
          <p className="mt-1 text-2xl font-semibold text-sb-ink">{open}</p>
        </Card>
        <Card>
          <p className="text-xs text-sb-muted">In progress</p>
          <p className="mt-1 text-2xl font-semibold text-sb-ink">{inProgress}</p>
        </Card>
        <Card>
          <p className="text-xs text-sb-muted">Assigned to me</p>
          <p className="mt-1 text-2xl font-semibold text-sb-ink">{assigned}</p>
        </Card>
      </div>
      {recent.length === 0 ? (
        <EmptyState
          title="No warranty tickets"
          description="New client complaints will appear here."
        />
      ) : (
        <div className="space-y-2">
          {recent.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/service/warranty/${ticket.id}`}
              className="block rounded-[12px] border border-sb-border bg-white p-4 hover:bg-sb-canvas/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sb-ink">
                    {ticket.ticketNumber} — {ticket.title}
                  </p>
                  <p className="text-xs text-sb-muted">
                    {ticket.project.name} · {ticket.clientUser.name} ·{" "}
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
