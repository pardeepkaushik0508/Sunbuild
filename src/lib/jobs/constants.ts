import { ProjectStatus } from "@prisma/client";

/** Days ahead counted as an "upcoming deadline" for Jobs Statistics. */
export const UPCOMING_DEADLINE_DAYS = Number(
  process.env.JOBS_UPCOMING_DEADLINE_DAYS || 30
);

export const JOBS_PAGE_SIZE = 10;

export const JOBS_PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

/** Active / in-flight operational projects (not planning-only). */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.SUBSTANTIAL_COMPLETION,
  ProjectStatus.PENDING_CEO_APPROVAL,
];

/** Planning / pre-construction. */
export const PLANNING_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.PRE_CONSTRUCTION,
];

/** Finished / handed over. */
export const COMPLETED_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.COMPLETED,
  ProjectStatus.HANDED_OVER,
];

export const BUDGET_WARNING_PERCENT = Number(
  process.env.JOBS_BUDGET_WARNING_PERCENT || 85
);

export type JobsSortKey =
  | "name"
  | "deadline"
  | "progress"
  | "budget"
  | "updated";

export type JobsStatusFilter =
  | "all"
  | "active"
  | "planning"
  | "completed"
  | "on_hold";
