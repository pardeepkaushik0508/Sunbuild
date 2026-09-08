import { JobStatisticsSkeleton } from "@/components/jobs/job-statistics";
import { JobCardsSkeleton } from "@/components/jobs/job-card";

export default function JobsLoading() {
  return (
    <div className="w-full space-y-5" aria-busy="true" aria-label="Loading jobs">
      <div className="h-14 animate-pulse rounded-[14px] bg-[#fff8e1]" />
      <JobStatisticsSkeleton />
      <div className="h-10 w-64 animate-pulse rounded bg-sb-border" />
      <JobCardsSkeleton />
    </div>
  );
}
