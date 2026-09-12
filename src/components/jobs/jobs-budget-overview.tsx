import Link from "next/link";
import {
  Role,
  DepositStatus,
  InvoiceStatus,
  ChangeOrderStatus,
} from "@prisma/client";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { sessionHasFinanceAccess } from "@/lib/authorization";
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

  if (!sessionHasFinanceAccess(session)) {
    return (
      <EmptyState
        title="Budget access restricted"
        description="Your role does not include finance visibility. Ask the Owner to enable Financial Report in Permissions."
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
  const [invoiceSums, depositSums, approvedChangeOrders] =
    ids.length === 0
      ? [[], [], []]
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
          prisma.changeOrder.findMany({
            where: {
              projectId: { in: ids },
              status: ChangeOrderStatus.APPROVED,
            },
            select: {
              projectId: true,
              title: true,
              amount: true,
            },
            orderBy: { clientActionAt: "asc" },
          }),
        ]);

  const invoiceByProject = new Map(
    invoiceSums.map((r) => [r.projectId, r._sum.amount ?? 0])
  );
  const depositByProject = new Map(
    depositSums.map((r) => [r.projectId, r._sum.amount ?? 0])
  );
  const cosByProject = new Map<
    string,
    Array<{ title: string; amount: number }>
  >();
  for (const co of approvedChangeOrders) {
    const list = cosByProject.get(co.projectId) ?? [];
    list.push({ title: co.title, amount: co.amount });
    cosByProject.set(co.projectId, list);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budget Overview"
        description="Project total cost = purchase price + approved change orders. Utilization uses paid invoices or received deposits."
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
            const changeOrders = cosByProject.get(p.id) ?? [];
            const budget = computeBudgetUtilization({
              purchasePrice: p.purchasePrice,
              approvedChangeOrders: changeOrders,
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
                  <div className="mt-3 space-y-2">
                    <JobsProgressBar value={budget.percent} />
                    <dl className="grid gap-1 text-xs text-sb-muted sm:grid-cols-2">
                      <div className="flex justify-between gap-3 sm:block">
                        <dt>Purchase price</dt>
                        <dd className="font-medium text-sb-ink">
                          {formatCurrency(budget.baseTotal)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 sm:block">
                        <dt>Approved change orders</dt>
                        <dd className="font-medium text-sb-ink">
                          {formatCurrency(budget.changeOrderTotal)}
                        </dd>
                      </div>
                    </dl>
                    {budget.changeOrders.length > 0 ? (
                      <ul className="space-y-1 border-t border-sb-border pt-2 text-xs">
                        {budget.changeOrders.map((co, idx) => (
                          <li
                            key={`${co.title}-${idx}`}
                            className="flex items-start justify-between gap-3"
                          >
                            <span className="text-sb-muted">{co.title}</span>
                            <span className="shrink-0 font-medium text-sb-ink">
                              +{formatCurrency(co.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
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
