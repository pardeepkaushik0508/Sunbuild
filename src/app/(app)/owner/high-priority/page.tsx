import { Role } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { HighPriorityMicrosoftPageClient } from "@/components/dashboard/high-priority-microsoft-page";

export default async function OwnerHighPriorityPage() {
  await requireRole(Role.OWNER);
  return (
    <HighPriorityMicrosoftPageClient connectReturnPath="/owner/high-priority" />
  );
}
