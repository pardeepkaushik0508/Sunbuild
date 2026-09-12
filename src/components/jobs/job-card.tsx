"use client";

import Link from "next/link";
import { useState } from "react";
import { Settings } from "lucide-react";
import { ProjectStatus } from "@prisma/client";
import { cn, formatCurrency } from "@/lib/utils";
import {
  projectStatusBadgeClass,
  projectStatusLabel,
} from "@/lib/jobs/status";
import { JobsProgressBar } from "@/components/jobs/jobs-progress-bar";
import { ConfigureJobDialog } from "@/components/jobs/configure-job-dialog";
import type { JobsListItem } from "@/lib/jobs/load-jobs";

function formatDeadline(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function JobCard({
  job,
  canConfigure,
  canViewBudget,
  projectManagers,
}: {
  job: JobsListItem;
  canConfigure: boolean;
  canViewBudget: boolean;
  projectManagers: Array<{ id: string; name: string }>;
}) {
  const [configureOpen, setConfigureOpen] = useState(false);

  return (
    <>
      <article className="rounded-[14px] border border-sb-border bg-sb-surface p-4 shadow-[var(--sb-shadow)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Link
              href={job.href}
              className="block truncate text-[16px] font-semibold text-sb-ink hover:text-sb-orange"
            >
              {job.name}
            </Link>
            <p className="mt-1 text-[13px] text-sb-body">
              Project Manager:{" "}
              <span className="text-sb-muted">{job.pmName ?? "Unassigned"}</span>
            </p>
            <p className="mt-0.5 text-[13px] text-sb-body">
              Client:{" "}
              <span className="text-sb-muted">{job.clientName ?? "Unassigned"}</span>
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-[8px] border px-3 py-1 text-[11px] font-bold tracking-wide uppercase",
                projectStatusBadgeClass(job.status)
              )}
            >
              {projectStatusLabel(job.status)}
            </span>
            {canConfigure ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setConfigureOpen(true);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#8b5cf6] bg-white px-3 text-[13px] font-medium text-[#8b5cf6] transition hover:bg-[#f5f3ff]"
              >
                <Settings size={15} />
                Configure
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 border-t border-sb-border-subtle pt-4 md:grid-cols-3">
          <div className="min-w-0">
            <p className="mb-2 text-[13px] font-semibold text-sb-ink">Progress</p>
            <JobsProgressBar value={job.progressPercent} />
            <p className="mt-1.5 text-[12px] text-sb-muted">
              {job.progressPercent}% complete
            </p>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-[13px] font-semibold text-sb-ink">
              Budget Utilization
            </p>
            {canViewBudget && job.hasBudget ? (
              <>
                <p className="text-[14px] font-medium text-sb-ink">
                  {formatCurrency(job.budgetUsed)} /{" "}
                  {formatCurrency(job.budgetTotal)}
                </p>
                <p className="mt-0.5 text-[12px] text-sb-muted">
                  {job.budgetPercent}% Used
                </p>
              </>
            ) : canViewBudget ? (
              <p className="text-[14px] text-sb-muted">No budget set</p>
            ) : (
              <p className="text-[14px] text-sb-muted">Restricted</p>
            )}
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-[13px] font-semibold text-sb-ink">Dates</p>
            <p className="text-[14px] font-medium text-sb-ink">
              Deadline: {formatDeadline(job.deadline)}
            </p>
            {job.startDate ? (
              <p className="mt-0.5 text-[12px] text-sb-muted">
                Started: {formatDeadline(job.startDate)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-sb-border-subtle pt-3 text-[13px] md:grid-cols-3">
          <div className="min-w-0">
            <span className="font-semibold text-sb-ink">Tasks: </span>
            <span className="text-sb-body">
              {job.totalTasks} total ·{" "}
              <span className="text-sb-orange font-medium">{job.openTasks} open</span> ·{" "}
              <span className="text-sb-green font-medium">{job.completedTasks} done</span>
            </span>
          </div>

          <div className="min-w-0 truncate">
            <span className="font-semibold text-sb-ink">Subcontractors: </span>
            <span className="text-sb-muted">
              {job.assignedSubcontractors && job.assignedSubcontractors.length > 0
                ? job.assignedSubcontractors.map((s) => s.name).join(", ")
                : "None assigned"}
            </span>
          </div>

          <div className="min-w-0 truncate">
            <span className="font-semibold text-sb-ink">Next Milestone: </span>
            <span className="text-sb-muted">
              {job.nextMilestone
                ? `${job.nextMilestone.title} (${formatDeadline(job.nextMilestone.targetDate)})`
                : "None scheduled"}
            </span>
          </div>
        </div>
      </article>

      {canConfigure ? (
        <ConfigureJobDialog
          open={configureOpen}
          onClose={() => setConfigureOpen(false)}
          job={job}
          projectManagers={projectManagers}
          statuses={Object.values(ProjectStatus)}
        />
      ) : null}
    </>
  );
}

export function JobCardsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading jobs">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-[14px] border border-sb-border bg-sb-surface p-5"
        >
          <div className="flex justify-between gap-4">
            <div className="space-y-2">
              <div className="h-5 w-56 rounded bg-sb-border" />
              <div className="h-3 w-40 rounded bg-sb-border" />
              <div className="h-3 w-32 rounded bg-sb-border" />
            </div>
            <div className="h-8 w-28 rounded bg-sb-border" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="h-8 rounded bg-sb-border" />
            <div className="h-8 rounded bg-sb-border" />
            <div className="h-8 rounded bg-sb-border" />
          </div>
        </div>
      ))}
    </div>
  );
}
