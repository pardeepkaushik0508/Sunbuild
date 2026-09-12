import Link from "next/link";
import {
  Building2,
  FolderKanban,
  Hexagon,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/card";
import { PmSelectProjectLink } from "@/components/pm/select-project-link";

const JOB_VISUALS = [
  {
    icon: Building2,
    wrap: "bg-emerald-50 text-emerald-600",
    bar: "green" as const,
    pct: "text-emerald-600",
  },
  {
    icon: LayoutGrid,
    wrap: "bg-sky-50 text-sky-600",
    bar: "blue" as const,
    pct: "text-sky-600",
  },
  {
    icon: Hexagon,
    wrap: "bg-violet-50 text-violet-600",
    bar: "purple" as const,
    pct: "text-violet-600",
  },
  {
    icon: Layers,
    wrap: "bg-amber-50 text-amber-600",
    bar: "orange" as const,
    pct: "text-amber-600",
  },
];

export type RecentJob = {
  id: string;
  name: string;
  progressPercent: number;
  /** Optional deep-link; ignored for card selection (stays on dashboard). */
  href?: string;
};

export function RecentJobsCard({
  jobs,
  selectedProjectId,
  selectHrefBase,
  viewAllHref,
  isLoading,
  error,
  onRetry,
}: {
  jobs: RecentJob[];
  selectedProjectId?: string | null;
  selectHrefBase: string;
  viewAllHref?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date());

  function selectHrefFor(projectId: string) {
    const [path, query] = selectHrefBase.split("?");
    const params = new URLSearchParams(query || "");
    params.set("projectId", projectId);
    return `${path}?${params.toString()}`;
  }

  return (
    <section className="flex h-full min-h-[320px] max-h-[420px] flex-col overflow-hidden rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)]">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ede9fe] text-[#8b5cf6]">
            <FolderKanban size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-sb-ink">Recent Jobs</h3>
            <p className="text-[12px] text-sb-muted">Track project progress</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              className="text-[12px] text-[#9ca3af] transition hover:text-sb-ink"
              title="Open jobs for this date"
            >
              {dateLabel}
            </Link>
          ) : (
            <span className="text-[12px] text-[#9ca3af]">{dateLabel}</span>
          )}
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              className="text-[12px] font-medium text-sb-muted hover:text-sb-ink"
            >
              View All
            </Link>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {isLoading ? (
          <JobsSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-sb-muted">{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="text-sm font-medium text-sb-blue hover:underline"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-10 text-center text-sm text-sb-muted">
            No active projects yet.
          </p>
        ) : (
          jobs.map((job, idx) => {
            const visual = JOB_VISUALS[idx % JOB_VISUALS.length];
            const Icon = visual.icon;
            const selected = selectedProjectId === job.id;
            const selectHref = selectHrefFor(job.id);
            return (
              <PmSelectProjectLink
                key={job.id}
                projectId={job.id}
                href={selectHref}
                aria-label={`Focus ${job.name} on dashboard`}
                title="Update dashboard for this project"
                className={cn(
                  "block rounded-[14px] border bg-sb-canvas p-3.5 text-left transition",
                  selected
                    ? "border-sb-orange/60 ring-1 ring-sb-orange/30"
                    : "border-sb-border hover:border-sb-orange/40"
                )}
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      visual.wrap
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-sb-ink">
                    {job.name}
                  </span>
                  <span className={cn("text-sm font-semibold", visual.pct)}>
                    {job.progressPercent}%
                  </span>
                </div>
                <ProgressBar value={job.progressPercent} color={visual.bar} />
              </PmSelectProjectLink>
            );
          })
        )}
      </div>
    </section>
  );
}

function JobsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading jobs">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-[14px] border border-sb-border bg-sb-canvas p-3.5"
        >
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-sb-border" />
            <div className="h-4 flex-1 rounded bg-sb-border" />
            <div className="h-4 w-10 rounded bg-sb-border" />
          </div>
          <div className="h-2.5 rounded-full bg-sb-border" />
        </div>
      ))}
    </div>
  );
}

/** Back-compat wrapper for older pages */
export function RecentJobsWidget({
  jobs,
}: {
  jobs: Array<{
    id: string;
    name: string;
    progressPercent: number;
    href?: string;
  }>;
}) {
  return (
    <RecentJobsCard
      jobs={jobs}
      selectHrefBase="/pm"
      selectedProjectId={jobs[0]?.id}
    />
  );
}
