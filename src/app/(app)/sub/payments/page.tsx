import { Role } from "@prisma/client";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { loadProjectSubcontractorPayments } from "@/lib/payments/subcontractor-summary";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function SubPaymentsPage() {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const projectIds = await getAccessibleProjectIds(session);

  const [projects, paymentGroups] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    Promise.all(
      projectIds.map((projectId) =>
        loadProjectSubcontractorPayments({ session, projectId }).then(
          (payments) => ({
            projectId,
            mine: payments.find((p) => p.subcontractorId === session.user.id),
          })
        )
      )
    ),
  ]);

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const rows = paymentGroups.filter((g) => g.mine);

  return (
    <div>
      <PageHeader
        title="My payments"
        description="Your payment totals by assigned job"
      />
      {rows.length === 0 ? (
        <EmptyState title="No payment records yet" />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.projectId}>
              <p className="font-medium">
                {nameById.get(row.projectId) ?? "Project"}
              </p>
              <p className="mt-2 text-lg font-semibold">
                Paid: {formatCurrency(row.mine!.paidAmount)}
              </p>
              {row.mine!.lastPaymentAt ? (
                <p className="mt-1 text-xs text-sb-muted">
                  Last payment {formatDate(row.mine!.lastPaymentAt)}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
