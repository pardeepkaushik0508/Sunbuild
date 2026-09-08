/**
 * Shared project progress — keep Recent Jobs, Gantt footer, and project detail in sync.
 * When schedule/milestone rows exist, derive from completion ratio (authoritative).
 * Otherwise fall back to stored Project.progressPercent.
 */
export type ProgressSourceItem = {
  status: string;
};

export function deriveProgressFromItems(items: ProgressSourceItem[]): number {
  if (items.length === 0) return 0;
  const completed = items.filter(
    (i) => i.status === "COMPLETED" || i.status === "DONE"
  ).length;
  return clampPercent(Math.round((completed / items.length) * 100));
}

export function computeProjectProgress(input: {
  progressPercent: number;
  scheduleItems?: ProgressSourceItem[];
  milestones?: ProgressSourceItem[];
}): number {
  const stored = clampPercent(input.progressPercent);
  const items = [
    ...(input.milestones ?? []),
    ...(input.scheduleItems ?? []),
  ];
  if (items.length === 0) return stored;
  return deriveProgressFromItems(items);
}

export function averageProgress(percents: number[]): number {
  if (percents.length === 0) return 0;
  return clampPercent(
    Math.round(percents.reduce((s, n) => s + n, 0) / percents.length)
  );
}

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
