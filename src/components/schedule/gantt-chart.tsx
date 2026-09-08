"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  format,
  max as maxDate,
  min as minDate,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type GanttTask,
  type GanttTaskStatus,
} from "@/lib/schedule/gantt-status";

export type { GanttTask, GanttTaskStatus };

export type ViewMode = "day" | "week" | "month";

const STATUS_COLOR: Record<GanttTaskStatus, string> = {
  COMPLETED: "bg-sb-gantt-done",
  IN_PROGRESS: "bg-sb-gantt-progress",
  AT_RISK: "bg-sb-gantt-risk",
  NOT_STARTED: "bg-sb-gantt-planned",
  PHASE: "bg-sb-gantt-phase",
};

const STATUS_DOT: Record<GanttTaskStatus, string> = {
  COMPLETED: "bg-sb-gantt-done",
  IN_PROGRESS: "bg-sb-gantt-progress",
  AT_RISK: "bg-sb-gantt-risk",
  NOT_STARTED: "bg-sb-gantt-planned",
  PHASE: "bg-sb-gantt-phase",
};

const STATUS_LABEL: Record<GanttTaskStatus, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
  AT_RISK: "At Risk",
  NOT_STARTED: "Not Started",
  PHASE: "Phase",
};

function toDate(value: Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function clampPct(n: number) {
  return Math.max(0, Math.min(100, n));
}

function barLayout(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date
) {
  const total = rangeEnd.getTime() - rangeStart.getTime();
  if (total <= 0) return { left: 0, width: 0 };
  const left = ((start.getTime() - rangeStart.getTime()) / total) * 100;
  const width = ((end.getTime() - start.getTime()) / total) * 100;
  return {
    left: clampPct(left),
    width: Math.max(1.2, clampPct(width)),
  };
}

export type GanttChartProps = {
  tasks: GanttTask[];
  progressPercent?: number;
  addHref?: string;
  className?: string;
  defaultView?: ViewMode;
  projectLabel?: string | null;
};

export function GanttChart({
  tasks,
  progressPercent = 0,
  addHref,
  className,
  defaultView = "day",
  projectLabel,
}: GanttChartProps) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const normalized = useMemo(
    () =>
      tasks
        .map((t) => {
          const startRaw = toDate(t.startDate);
          const endRaw = toDate(t.endDate);
          if (!startRaw || !endRaw) return null;
          const start = startOfDay(startRaw);
          const end = endOfDay(endRaw.getTime() < startRaw.getTime() ? startRaw : endRaw);
          return { ...t, start, end };
        })
        .filter((t): t is NonNullable<typeof t> => t != null),
    [tasks]
  );

  const visible = useMemo(() => {
    return normalized.filter((t) => {
      if (!t.parentId) return true;
      return !collapsed.has(t.parentId);
    });
  }, [normalized, collapsed]);

  const range = useMemo(() => {
    if (normalized.length === 0) {
      const start = startOfDay(new Date());
      return { start, end: addDays(start, 30) };
    }
    const start = minDate(normalized.map((t) => t.start));
    const end = maxDate(normalized.map((t) => t.end));
    const padEnd = addDays(end, view === "month" ? 14 : 3);
    return { start, end: padEnd };
  }, [normalized, view]);

  const columns = useMemo(() => {
    if (view === "month") {
      return eachMonthOfInterval({ start: range.start, end: range.end }).map(
        (d) => ({
          key: format(d, "yyyy-MM"),
          label: format(d, "MMM yyyy"),
          sub: format(d, "MMM"),
        })
      );
    }
    if (view === "week") {
      return eachWeekOfInterval(
        { start: range.start, end: range.end },
        { weekStartsOn: 1 }
      ).map((d) => ({
        key: format(d, "yyyy-MM-dd"),
        label: `W${format(d, "II")}`,
        sub: format(startOfWeek(d, { weekStartsOn: 1 }), "MMM d"),
      }));
    }
    return eachDayOfInterval({ start: range.start, end: range.end }).map(
      (d) => ({
        key: format(d, "yyyy-MM-dd"),
        label: format(d, "d"),
        sub: format(d, "EEE"),
      })
    );
  }, [range, view]);

  const colMinWidth = view === "day" ? 36 : view === "week" ? 72 : 110;

  const monthBands = useMemo(() => {
    if (view !== "day") return [];
    return eachMonthOfInterval({ start: range.start, end: range.end }).map(
      (m) => {
        const monthStart = maxDate([m, range.start]);
        const next = new Date(m.getFullYear(), m.getMonth() + 1, 0);
        const monthEnd = minDate([endOfDay(next), range.end]);
        return {
          label: format(m, "MMMM yyyy"),
          ...barLayout(monthStart, monthEnd, range.start, range.end),
        };
      }
    );
  }, [range, view]);

  const todayLeft = useMemo(() => {
    const today = new Date();
    if (today < range.start || today > range.end) return null;
    return barLayout(today, today, range.start, range.end).left;
  }, [range]);

  const counts = useMemo(() => {
    const base = {
      COMPLETED: 0,
      IN_PROGRESS: 0,
      AT_RISK: 0,
      NOT_STARTED: 0,
    };
    for (const t of normalized) {
      if (t.isPhase || t.status === "PHASE") continue;
      if (t.status in base) base[t.status as keyof typeof base] += 1;
    }
    return base;
  }, [normalized]);

  const rowH = 52;
  const headerH = view === "day" ? 56 : 44;
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    visible.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [visible]);

  const deps = useMemo(() => {
    return visible
      .filter((t) => t.dependsOnId && idToIndex.has(t.dependsOnId))
      .map((t) => {
        const fromIdx = idToIndex.get(t.dependsOnId!)!;
        const toIdx = idToIndex.get(t.id)!;
        const from = visible[fromIdx];
        const to = visible[toIdx];
        const fromBar = barLayout(from.start, from.end, range.start, range.end);
        const toBar = barLayout(to.start, to.end, range.start, range.end);
        return {
          x1: fromBar.left + fromBar.width,
          y1: headerH + fromIdx * rowH + rowH / 2,
          x2: toBar.left,
          y2: headerH + toIdx * rowH + rowH / 2,
        };
      });
  }, [visible, idToIndex, range, headerH]);

  const timelineLabel = `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;
  // Min width from column count; grid track grows with `1fr` so week/day/month fill the card.
  const timelineMinWidth = Math.max(columns.length * colMinWidth, view === "week" ? 720 : 640);

  function togglePhase(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[16px] border border-sb-border bg-sb-surface shadow-[var(--sb-shadow)]",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sb-border px-4 py-3">
        <div className="sb-pill-toggle" role="tablist" aria-label="Timeline scale">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              className={cn(view === mode && "is-active")}
              onClick={() => setView(mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-sb-muted">
          {projectLabel ? (
            <>
              <span className="font-medium text-sb-ink">{projectLabel}</span>
              {" · "}
            </>
          ) : null}
          {timelineLabel}
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="w-full" style={{ minWidth: 280 + timelineMinWidth }}>
          <div
            className="grid w-full"
            style={{
              gridTemplateColumns: `280px minmax(${timelineMinWidth}px, 1fr)`,
            }}
          >
            <div className="sticky left-0 z-30 border-r border-sb-border bg-sb-surface">
              <div
                className="flex items-center justify-between border-b border-sb-border px-4 text-sm font-semibold text-sb-ink"
                style={{ height: headerH }}
              >
                <span>Tasks</span>
                {addHref ? (
                  <Link
                    href={addHref}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-sb-border text-sb-muted hover:bg-sb-canvas"
                    aria-label="Add schedule item"
                  >
                    <Plus size={14} />
                  </Link>
                ) : null}
              </div>
              {visible.map((task) => {
                const isPhase = Boolean(task.isPhase || task.status === "PHASE");
                const isCollapsed = collapsed.has(task.id);
                const rowInner = (
                  <>
                    {isPhase ? (
                      <button
                        type="button"
                        className="shrink-0 text-sb-muted"
                        onClick={() => togglePhase(task.id)}
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? "Expand phase" : "Collapse phase"}
                      >
                        {isCollapsed ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                          task.isCritical
                            ? "bg-sb-gantt-critical"
                            : STATUS_DOT[task.status]
                        )}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm text-sb-ink",
                          isPhase && "font-semibold"
                        )}
                      >
                        {task.title}
                      </p>
                      <p className="truncate text-[11px] text-sb-muted">
                        {task.meta
                          ? task.meta
                          : [
                              !isPhase ? STATUS_LABEL[task.status] : null,
                              task.assigneeName,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </div>
                    {task.assigneeName && isPhase ? (
                      <span className="hidden max-w-[88px] truncate text-[11px] text-sb-muted sm:inline">
                        {task.assigneeName}
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-2 border-b border-sb-border-subtle px-3",
                      isPhase && "bg-[#f5f3ff]/60"
                    )}
                    style={{ height: rowH }}
                  >
                    {task.href && !isPhase ? (
                      <Link
                        href={task.href}
                        className="flex min-w-0 flex-1 items-center gap-2 hover:opacity-90"
                      >
                        {rowInner}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {rowInner}
                      </div>
                    )}
                  </div>
                );
              })}
              {visible.length === 0 ? (
                <div className="px-4 py-10 text-sm text-sb-muted">
                  No schedule items yet.
                </div>
              ) : null}
            </div>

            <div className="relative bg-[#fafafa]">
              <div
                className="relative border-b border-sb-border"
                style={{ height: headerH }}
              >
                {view === "day" ? (
                  <div className="absolute inset-x-0 top-0 flex h-6 text-[10px] font-medium text-sb-muted">
                    {monthBands.map((m) => (
                      <div
                        key={m.label}
                        className="overflow-hidden border-r border-sb-border-subtle px-2 pt-1"
                        style={{
                          position: "absolute",
                          left: `${m.left}%`,
                          width: `${m.width}%`,
                        }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 grid",
                    view === "day" ? "top-6" : "top-0"
                  )}
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(${colMinWidth}px, 1fr))`,
                  }}
                >
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      className="border-r border-sb-border-subtle px-0.5 text-center"
                    >
                      <p className="text-[11px] font-semibold text-sb-ink">
                        {col.label}
                      </p>
                      <p className="text-[9px] text-sb-muted">{col.sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="relative"
                style={{ height: Math.max(visible.length, 1) * rowH }}
              >
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(${colMinWidth}px, 1fr))`,
                  }}
                >
                  {columns.map((col) => (
                    <div
                      key={`grid-${col.key}`}
                      className="border-r border-sb-border-subtle"
                    />
                  ))}
                </div>

                {todayLeft != null ? (
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-sb-today"
                    style={{ left: `${todayLeft}%` }}
                    title="Today"
                  />
                ) : null}

                <svg
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                  viewBox={`0 0 1000 ${Math.max(visible.length, 1) * rowH + headerH}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <marker
                      id="gantt-arrow"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="#9ca3af" />
                    </marker>
                  </defs>
                  {deps.map((d, i) => {
                    const x1 = d.x1 * 10;
                    const x2 = d.x2 * 10;
                    const midX = (x1 + x2) / 2;
                    return (
                      <path
                        key={i}
                        d={`M ${x1} ${d.y1} C ${midX} ${d.y1}, ${midX} ${d.y2}, ${x2} ${d.y2}`}
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                        markerEnd="url(#gantt-arrow)"
                      />
                    );
                  })}
                </svg>

                {visible.map((task, idx) => {
                  const { left, width } = barLayout(
                    task.start,
                    task.end,
                    range.start,
                    range.end
                  );
                  const days =
                    differenceInCalendarDays(task.end, task.start) + 1;
                  const progress = clampPct(task.progress ?? 0);
                  const isPhase = Boolean(task.isPhase || task.status === "PHASE");
                  const barColor = task.isCritical
                    ? "bg-sb-gantt-critical"
                    : STATUS_COLOR[task.status];

                  const bar = (
                    <div
                      className={cn(
                        "relative h-full overflow-hidden rounded-md shadow-sm",
                        barColor,
                        isPhase && "opacity-90"
                      )}
                    >
                      {progress > 0 && progress < 100 && !isPhase ? (
                        <div
                          className="absolute inset-y-0 left-0 bg-black/15"
                          style={{ width: `${progress}%` }}
                        />
                      ) : null}
                      {task.isMilestone ? (
                        <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[#facc15] shadow-sm" />
                      ) : null}
                    </div>
                  );

                  return (
                    <div
                      key={task.id}
                      className="absolute z-[15]"
                      style={{
                        top: idx * rowH + 14,
                        left: `${left}%`,
                        width: `${width}%`,
                        height: 24,
                      }}
                      title={`${task.title}${task.assigneeName ? ` · ${task.assigneeName}` : ""} · ${STATUS_LABEL[task.status]} · ${format(task.start, "MMM d")} – ${format(task.end, "MMM d")} · ${Math.round(progress)}%${task.isCritical ? " · Critical" : ""}`}
                    >
                      {task.href && !isPhase ? (
                        <Link href={task.href} className="block h-full">
                          {bar}
                        </Link>
                      ) : (
                        bar
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-sb-border px-4 py-3 text-xs text-sb-muted">
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <span className="font-medium text-sb-ink">Project Progress:</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-sb-blue"
              style={{ width: `${clampPct(progressPercent)}%` }}
            />
          </div>
          <span className="font-semibold text-sb-ink">
            {Math.round(clampPct(progressPercent))}%
          </span>
        </div>
        <p>
          Timeline: <span className="text-sb-ink">{timelineLabel}</span>
        </p>
        <p className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sb-gantt-critical" />
          Critical Path
        </p>
        <div className="ml-auto flex flex-wrap gap-3">
          {(
            [
              ["Completed", counts.COMPLETED, "bg-sb-gantt-done"],
              ["In Progress", counts.IN_PROGRESS, "bg-sb-gantt-progress"],
              ["At Risk", counts.AT_RISK, "bg-sb-gantt-risk"],
              ["Not Started", counts.NOT_STARTED, "bg-sb-gantt-planned"],
            ] as const
          ).map(([label, count, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
              {label} ({count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
