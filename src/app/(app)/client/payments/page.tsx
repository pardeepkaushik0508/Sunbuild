import { ChangeOrderStatus, Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { ClientPaymentsBoard } from "@/components/client/payments-board";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";
import { invoicePaymentBadge } from "@/lib/client/display";
import {
  depositPaymentBadge,
  parseChangeOrderClientTotal,
} from "@/lib/client/flow";
import { depositDisplayLabel } from "@/lib/labels";

export default async function ClientPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await requireRole(Role.CLIENT);
  const sp = await searchParams;
  const project = await resolveClientProject(session, sp.projectId);
  const allIds = await getAccessibleProjectIds(session);

  if (!project) {
    return (
      <EmptyState
        title="No project assigned"
        description="Invoices and change orders will appear once your home is linked."
      />
    );
  }

  const projects =
    allIds.length > 1
      ? await prisma.project.findMany({
          where: { id: { in: allIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [{ id: project.id, name: project.name }];

  const [invoices, changeOrders, deposits] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        projectId: project.id,
        status: { notIn: ["DRAFT", "VOID"] },
      },
      orderBy: { issueDate: "desc" },
    }),
    prisma.changeOrder.findMany({
      where: {
        projectId: project.id,
        status: { not: ChangeOrderStatus.DRAFT },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.deposit.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const invoiceCards = invoices.map((inv) => {
    const badge = invoicePaymentBadge(inv.status, inv.dueDate);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      title: `Invoice ${inv.invoiceNumber}`,
      description: inv.notes,
      amount: inv.amount,
      status: inv.status,
      paymentLabel: badge.label,
      paymentTone: badge.tone,
      phase: null as string | null,
      dueDate: inv.dueDate?.toISOString() ?? null,
      issueDate: inv.issueDate.toISOString(),
      notes: inv.notes,
      filePath: inv.filePath,
      fileName: inv.fileName,
    };
  });

  const coCards = changeOrders.map((co) => ({
    id: co.id,
    title: co.title,
    description: co.description,
    amount: co.amount,
    displayAmount: parseChangeOrderClientTotal(co.description, co.amount).total,
    status: co.status,
    phase: co.reason,
    actionDate: (co.clientActionAt ?? co.createdAt).toISOString(),
    attachmentPath: co.attachmentPath,
    canDecide: co.status === ChangeOrderStatus.PENDING_CLIENT,
    clientComment: co.clientComment,
  }));

  const depositCards = deposits.map((dep) => {
    const badge = depositPaymentBadge(dep.status, dep.dueDate);
    return {
      id: dep.id,
      label: depositDisplayLabel(dep.label),
      amount: dep.amount,
      status: dep.status,
      paymentLabel: badge.label,
      paymentTone: badge.tone,
      dueDate: dep.dueDate?.toISOString() ?? null,
      reference: dep.reference,
    };
  });

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={project.id}
      />
      <PageHeader
        title="Deposits, invoices & payments"
        description="Purchase-agreement deposits, change-order invoices, and pending change orders. Online payment is not available in this MVP."
      />
      <ClientPaymentsBoard
        invoices={invoiceCards}
        changeOrders={coCards}
        deposits={depositCards}
      />
    </div>
  );
}
