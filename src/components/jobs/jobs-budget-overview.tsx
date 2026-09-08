import Link from "next/link";
import { Role, DepositStatus, InvoiceStatus } from "@prisma/client";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { hasFinanceAccess } from "@/lib/permissions";
import { computeBudgetUtilization } from "@/lib/jobs/budget";
import { formatCurrency } from "@/lib/utils";
import { PageHeader, EmptyState, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobsProgressBar } from "@/components/jobs/jobs-progress-bar";

export async function JobsBudgetOverview({
  backHref = "/owner/jobs",
}: {
  backHref?: string;
}) {
  const session = await requireRole([
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
    Role.BOOKKEEPER,
  ]);

  if (
    !hasFinanceAccess(
      session.membership.role,
      session.membership.financeAccess
    )
  ) {
    return (
      <EmptyState
        title="Budget access restricted"
        description="Your role does not include finance visibility."
        action={
          <Link href={backHref}>
            <Button variant="outline">Back to Jobs</Button>
          </Link>
        }
      />
    );
  }

  const projectIds = await getAccessibleProjectIds(session);
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      name: true,
      purchasePrice: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  const ids = projects.map((p) => p.id);
  const [invoiceSums, depositSums] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.invoice.groupBy({
            by: ["projectId"],
            where: { projectId: { in: ids }, status: InvoiceStatus.PAID },
            _sum: { amount: true },
          }),
          prisma.deposit.groupBy({
            by: ["projectId"],
            where: { projectId: { in: ids }, status: DepositStatus.RECEIVED },
            _sum: { amount: true },
          }),
        ]);

  const invoiceByProject = new Map(
    invoiceSums.map((r) => [r.projectId, r._sum.amount ?? 0])
  );
  const depositByProject = new Map(
    depositSums.map((r) => [r.projectId, r._sum.amount ?? 0])
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budget Overview"
        description="Project budget utilization from purchase price, paid invoices, and received deposits"
        actions={
          <Link href={backHref}>
            <Button variant="outline" size="sm">
              Back to Jobs
            </Button>
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects"
          description="Create a job to track budget utilization."
        />
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const paid = invoiceByProject.get(p.id) ?? 0;
            const received = depositByProject.get(p.id) ?? 0;
            const budget = computeBudgetUtilization({
              purchasePrice: p.purchasePrice,
              invoices: paid > 0 ? [{ amount: paid, status: "PAID" }] : [],
              deposits:
                received > 0
                  ? [{ amount: received, status: "RECEIVED" }]
                  : [],
            });
            return (
              <Card key={p.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/pm/projects/${p.id}`}
                    className="text-[15px] font-semibold text-sb-ink hover:text-sb-blue"
                  >
                    {p.name}
                  </Link>
                  <p className="text-[13px] text-sb-muted">
                    {budget.hasBudget
                      ? `${formatCurrency(budget.used)} / ${formatCurrency(budget.total)}`
                      : "No purchase price set"}
                  </p>
                </div>
                {budget.hasBudget ? (
                  <div className="mt-3">
                    <JobsProgressBar value={budget.percent} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
