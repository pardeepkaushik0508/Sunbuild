import { Role } from "@prisma/client";
import { JobsReportsView } from "@/components/jobs/jobs-reports-view";

export default function PMJobsReportsPage() {
  return (
    <JobsReportsView
      backHref="/pm/projects"
      roles={[
        Role.PROJECT_MANAGER,
        Role.OWNER,
        Role.CEO,
        Role.OPERATIONS_ADMIN,
      ]}
    />
  );
}
