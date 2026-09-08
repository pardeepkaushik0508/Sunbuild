import { Role } from "@prisma/client";
import { OwnerTabs } from "@/components/owner/owner-tabs";
import { PageHeader } from "@/components/ui/card";
import { PermissionsMatrixClient } from "@/components/owner/permissions-matrix";
import { buildProjectInsights, depositOpenStatuses } from "@/lib/insights";
import { getCompanyPermissionMatrix } from "@/lib/permission-matrix-store";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";

export default async function OwnerPermissionsPage() {
  const session = await requireRole(Role.OWNER);
  const companyId = session.membership.companyId;

  const [matrix, delayed, depositSum, docs] = await Promise.all([
    getCompanyPermissionMatrix(companyId),
    prisma.scheduleItem.count({
      where: {
        status: "DELAYED",
        project: { companyId },
      },
    }),
    prisma.deposit.aggregate({
      where: {
        project: { companyId },
        status: { in: depositOpenStatuses() },
      },
      _sum: { amount: true },
    }),
    prisma.document.count({ where: { project: { companyId } } }),
  ]);

  const insights = buildProjectInsights({
    delayedScheduleCount: delayed,
    expectedDepositAmount: depositSum._sum.amount ?? 0,
    pendingDocCount: Math.min(docs, 12),
  });

  return (
    <div className="space-y-5">
      <OwnerTabs />
      <PageHeader
        title="Permissions"
        description="Configure module access for each role across Sunview Homes"
      />
      <PermissionsMatrixClient initialMatrix={matrix} insights={insights} />
    </div>
  );
}
