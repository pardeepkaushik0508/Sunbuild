import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { Trash2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { ROLE_HOME } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/card";
import { loadTrashData } from "@/lib/trash/load-trash";
import { TrashDashboard } from "@/components/owner/trash-dashboard";

export default async function OwnerTrashPage() {
  const session = await requireSession();
  const role = session.membership.role;
  if (
    role !== Role.OWNER &&
    role !== Role.OPERATIONS_ADMIN &&
    role !== Role.CEO
  ) {
    redirect(ROLE_HOME[role]);
  }

  const data = await loadTrashData(session.membership.companyId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        description={`Soft-deleted users and projects · auto-purge after ${data.retentionDays} days`}
        icon={<Trash2 className="h-5 w-5" />}
      />
      <TrashDashboard data={data} />
    </div>
  );
}
