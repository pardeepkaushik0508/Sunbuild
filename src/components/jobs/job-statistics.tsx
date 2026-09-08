import type { JobsStatistics } from "@/lib/jobs/load-jobs";

export function JobStatisticsCard({ stats }: { stats: JobsStatistics }) {
  const rows = [
    { label: "Active Projects", value: stats.activeProjects },
    { label: "Completed", value: stats.completed },
    { label: "In Planning", value: stats.inPlanning },
    { label: "Upcoming Deadlines", value: stats.upcomingDeadlines },
  ];

  return (
    <section className="rounded-[14px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)] sm:p-6">
      <h2 className="text-[16px] font-semibold text-sb-ink">Job Statistics</h2>
      <dl className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4"
          >
            <dt className="text-[14px] text-sb-muted">{row.label}</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-sb-ink">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function JobStatisticsSkeleton() {
  return (
    <section
      className="animate-pulse rounded-[14px] border border-sb-border bg-sb-surface p-5 sm:p-6"
      aria-busy="true"
      aria-label="Loading job statistics"
    >
      <div className="h-5 w-36 rounded bg-sb-border" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-32 rounded bg-sb-border" />
            <div className="h-4 w-8 rounded bg-sb-border" />
          </div>
        ))}
      </div>
    </section>
  );
}
