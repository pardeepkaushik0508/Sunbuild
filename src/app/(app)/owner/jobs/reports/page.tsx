import { Role } from "@prisma/client";
import { JobsReportsView } from "@/components/jobs/jobs-reports-view";

export default function OwnerJobsReportsPage() {
  return (
    <JobsReportsView
      backHref="/owner/jobs"
      roles={[Role.OWNER, Role.CEO, Role.OPERATIONS_ADMIN]}
    />
  );
}
