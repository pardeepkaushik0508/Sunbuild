import { ChangeOrderStatus, Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { ClientChangeOrdersBoard } from "@/components/client/change-orders-board";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveClientProject } from "@/lib/client/project";

export default async function ClientChangeOrdersPage({
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
        description="Change orders will appear once your home is linked."
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

  const changeOrders = await prisma.changeOrder.findMany({
    where: {
      projectId: project.id,
      status: { not: ChangeOrderStatus.DRAFT },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const coCards = changeOrders.map((co) => ({
    id: co.id,
    title: co.title,
    description: co.description,
    amount: co.amount,
    status: co.status,
    phase: co.reason,
    scheduleImpact: co.scheduleImpact,
    budgetImpact: co.budgetImpact,
    actionDate: (co.clientActionAt ?? co.createdAt).toISOString(),
    attachmentPath: co.attachmentPath,
    canDecide: co.status === ChangeOrderStatus.PENDING_CLIENT,
    clientComment: co.clientComment,
  }));

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={project.id}
      />
      <PageHeader
        title="Change Orders"
        description="Approve or deny pending changes. Approved and denied orders stay available here."
      />
      <ClientChangeOrdersBoard changeOrders={coCards} />
    </div>
  );
}
