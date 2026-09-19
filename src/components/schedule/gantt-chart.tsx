"use client";

import Link from "next/link";
import { useMemo, useState, type MouseEvent } from "react";
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
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type GanttTask,
  type GanttTaskStatus,
} from "@/lib/schedule/gantt-status";
import { calculateScheduleVariance } from "@/lib/schedule/variance";
import {
  GANTT_BODY_MAX_VISIBLE_ROWS,
  GANTT_ROW_HEIGHT_DUAL,
  resolveGanttScale,
} from "@/lib/schedule/gantt-scale";

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
  COMPLETED: "Done",
  IN_PROGRESS: "In progress",
  AT_RISK: "Needs attention",
  NOT_STARTED: "Not started",
  PHASE: "Phase",
};

function toDate(value: Date | string | null | undefined) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toInputDate(d: Date) {
  return format(d, "yyyy-MM-dd");
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

function varianceBarLabel(days: number | null | undefined): string | null {
  if (days == null || days === 0) return null;
  const abs = Math.abs(days);
  const unit = abs === 1 ? "day" : "days";
  return days > 0 ? `${abs} ${unit} late` : `${abs} ${unit} early`;
}

/** Baseline sits on top; current/actual is flush underneath (no gap). */
const BASELINE_BAR_H = 12;
const WORKING_BAR_H = 18;
const BASELINE_BAR_TOP = Math.round(
  (GANTT_ROW_HEIGHT_DUAL - BASELINE_BAR_H - WORKING_BAR_H) / 2
);
const WORKING_BAR_TOP = BASELINE_BAR_TOP + BASELINE_BAR_H;

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
  defaultView,
  projectLabel,
}: GanttChartProps) {
  const [view, setView] = useState<ViewMode | null>(defaultView ?? null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [hover, setHover] = useState<{
    id: string;
    title: string;
    status: string;
    assignee: string | null;
    project: string | null;
    dates: string;
    baseline: string;
    variance: string;
    progress: number;
    x: number;
    y: number;
  } | null>(null);

  const normalized = useMemo(
    () =>
      tasks
        .map((t) => {
          const startRaw = toDate(t.startDate) ?? toDate(t.currentStartDate);
          const endRaw = toDate(t.endDate) ?? toDate(t.currentEndDate);
          const baselineStart = toDate(t.baselineStartDate) ?? startRaw;
          const baselineEnd = toDate(t.baselineEndDate) ?? endRaw;
          const actualEnd = toDate(t.actualEndDate);
          const actualStart = toDate(t.actualStartDate);
          if (!startRaw && !baselineStart) return null;
          const start = startOfDay(startRaw ?? baselineStart!);
          const rawEnd = endRaw ?? baselineEnd ?? startRaw ?? baselineStart!;
          const end = endOfDay(
            rawEnd.getTime() < start.getTime() ? start : rawEnd
          );
          const variance = calculateScheduleVariance({
            baselineEnd: baselineEnd ?? end,
            currentEnd: end,
            actualEnd,
            status: t.status,
          });
          return {
            ...t,
            start,
            end,
            baselineStart: baselineStart ? startOfDay(baselineStart) : start,
            baselineEnd: baselineEnd
              ? endOfDay(
                  baselineEnd.getTime() < (baselineStart ?? start).getTime()
                    ? baselineStart ?? start
                    : baselineEnd
                )
              : end,
            actualStart: actualStart ? startOfDay(actualStart) : null,
            actualEnd: actualEnd ? endOfDay(actualEnd) : null,
            variance,
          };
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

  const dataRange = useMemo(() => {
    if (normalized.length === 0) {
      const start = startOfDay(new Date());
      return { start, end: addDays(start, 30) };
    }
    const start = minDate(
      normalized.flatMap((t) => [t.start, t.baselineStart].filter(Boolean))
    );
    const end = maxDate(
      normalized.flatMap((t) =>
        [t.end, t.baselineEnd, t.actualEnd].filter((d): d is Date => d != null)
      )
    );
    return { start, end: addDays(end, 3) };
  }, [normalized]);

  const range = useMemo(() => {
    const customStart = rangeFrom ? startOfDay(parseISO(rangeFrom)) : null;
    const customEnd = rangeTo ? endOfDay(parseISO(rangeTo)) : null;
    if (
      customStart &&
      customEnd &&
      !Number.isNaN(customStart.getTime()) &&
      !Number.isNaN(customEnd.getTime())
    ) {
      if (customEnd.getTime() >= customStart.getTime()) {
        return { start: customStart, end: customEnd };
      }
      return { start: startOfDay(customEnd), end: endOfDay(customStart) };
    }
    if (customStart && !Number.isNaN(customStart.getTime())) {
      return {
        start: customStart,
        end: addDays(customStart, view === "month" ? 90 : view === "week" ? 60 : 30),
      };
    }
    return dataRange;
  }, [dataRange, rangeFrom, rangeTo, view]);

  const scale = useMemo(
    () => resolveGanttScale(range.start, range.end, view),
    [range, view]
  );

  const columns = useMemo(() => {
    if (scale.primary === "month") {
      return eachMonthOfInterval({ start: range.start, end: range.end }).map(
        (d) => ({
          key: format(d, "yyyy-MM"),
          label: format(d, "MMM yyyy"),
          sub: format(d, "MMM"),
        })
      );
    }
    if (scale.primary === "week") {
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
  }, [range, scale]);

  const colMinWidth = scale.colMinWidth;

  const monthBands = useMemo(() => {
    if (scale.primary === "month" && scale.secondary === "week") {
      return eachWeekOfInterval(
        { start: range.start, end: range.end },
        { weekStartsOn: 1 }
      ).map((w) => {
        const weekStart = maxDate([w, range.start]);
        const weekEnd = minDate([addDays(w, 6), range.end]);
        return {
          label: format(w, "MMM d"),
          ...barLayout(weekStart, endOfDay(weekEnd), range.start, range.end),
        };
      });
    }
    if (scale.primary === "day" || scale.primary === "week") {
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
    }
    return [];
  }, [range, scale]);

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

  const rowH = GANTT_ROW_HEIGHT_DUAL;
  const headerH = scale.primary === "day" || scale.secondary !== "none" ? 56 : 44;
  const bodyMaxHeight = GANTT_BODY_MAX_VISIBLE_ROWS * rowH;

  const timelineLabel = `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;
  // Min width from column count; grid track grows with `1fr` so week/day/month fill the card.
  const activeView: ViewMode = view ?? scale.primary;
  const timelineMinWidth = Math.max(
    columns.length * colMinWidth,
    activeView === "week" ? 720 : 640
  );

  function togglePhase(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyDataRange() {
    setRangeFrom(toInputDate(dataRange.start));
    setRangeTo(toInputDate(dataRange.end));
  }

  function clearCustomRange() {
    setRangeFrom("");
    setRangeTo("");
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[16px] border border-sb-border bg-sb-surface shadow-[var(--sb-shadow)]",
        className
      )}
    >
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-3 border-b border-sb-border bg-sb-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="sb-pill-toggle" role="tablist" aria-label="How to view time">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={activeView === mode}
                className={cn(activeView === mode && "is-active")}
                onClick={() => setView(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-sb-muted">
              <span className="shrink-0">From</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="h-8 rounded-[8px] border border-sb-border bg-white px-2 text-[12px] text-sb-ink"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-sb-muted">
              <span className="shrink-0">To</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="h-8 rounded-[8px] border border-sb-border bg-white px-2 text-[12px] text-sb-ink"
              />
            </label>
            <button
              type="button"
              onClick={applyDataRange}
              className="h-8 rounded-[8px] border border-sb-border bg-white px-2.5 text-[12px] font-medium text-sb-ink hover:bg-sb-canvas"
            >
              Show all work
            </button>
            {rangeFrom || rangeTo ? (
              <button
                type="button"
                onClick={clearCustomRange}
                className="h-8 rounded-[8px] px-2 text-[12px] font-medium text-sb-muted hover:text-sb-ink"
              >
                Clear dates
              </button>
            ) : null}
          </div>
        </div>
        <p className="max-w-md text-right text-xs text-sb-muted">
          {projectLabel ? (
            <>
              <span className="font-medium text-sb-ink">{projectLabel}</span>
              {" · "}
            </>
          ) : null}
          {timelineLabel}
          <span className="mt-0.5 block text-[11px] text-sb-muted">
            Top bar = original plan · Bottom bar = current schedule
          </span>
        </p>
      </div>

      <div className="w-full overflow-auto" style={{ maxHeight: headerH + bodyMaxHeight + 8 }}>
        <div className="w-full" style={{ minWidth: 280 + timelineMinWidth }}>
          <div
            className="grid w-full"
            style={{
              gridTemplateColumns: `280px minmax(${timelineMinWidth}px, 1fr)`,
            }}
          >
            <div className="sticky left-0 z-30 border-r border-sb-border bg-sb-surface">
              <div
                className="sticky top-0 z-40 flex items-center justify-between border-b border-sb-border bg-sb-surface px-4 text-sm font-semibold text-sb-ink"
                style={{ height: headerH }}
              >
                <span>Work</span>
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
                          STATUS_DOT[task.status]
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
                              !isPhase ? task.variance.proseLabel : null,
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
                  Nothing to show yet. Add work with start and end dates and it
                  will appear on this timeline.
                </div>
              ) : null}
            </div>

            <div className="relative bg-[#fafafa]">
              <div
                className="sticky top-0 z-20 border-b border-sb-border bg-[#fafafa]"
                style={{ height: headerH }}
              >
                {scale.primary === "day" || scale.secondary !== "none" ? (
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
                    scale.primary === "day" || scale.secondary !== "none"
                      ? "top-6"
                      : "top-0"
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

                {visible.map((task, idx) => {
                  const workingStart = task.actualStart ?? task.start;
                  const workingEnd = task.actualEnd ?? task.end;
                  const baselineBar = barLayout(
                    task.baselineStart,
                    task.baselineEnd,
                    range.start,
                    range.end
                  );
                  const workingBar = barLayout(
                    workingStart,
                    workingEnd,
                    range.start,
                    range.end
                  );
                  const days =
                    differenceInCalendarDays(workingEnd, workingStart) + 1;
                  const progress = clampPct(task.progress ?? 0);
                  const isPhase = Boolean(task.isPhase || task.status === "PHASE");
                  const barColor = STATUS_COLOR[task.status];
                  const delayLabel = varianceBarLabel(task.variance.days);

                  const showHover = (
                    e: MouseEvent<HTMLDivElement | HTMLAnchorElement>
                  ) => {
                    const rect = (
                      e.currentTarget as HTMLDivElement
                    ).getBoundingClientRect();
                    const parent = (
                      e.currentTarget.closest(
                        ".relative.overflow-hidden"
                      ) as HTMLElement | null
                    )?.getBoundingClientRect();
                    setHover({
                      id: task.id,
                      title: task.title,
                      status: STATUS_LABEL[task.status],
                      assignee: task.assigneeName ?? null,
                      project: task.projectName ?? null,
                      dates: `${format(workingStart, "MMM d, yyyy")} – ${format(workingEnd, "MMM d, yyyy")} (${days} ${days === 1 ? "day" : "days"})`,
                      baseline: `${format(task.baselineStart, "MMM d, yyyy")} – ${format(task.baselineEnd, "MMM d, yyyy")}`,
                      variance: task.variance.proseLabel,
                      progress: Math.round(progress),
                      x: rect.left - (parent?.left ?? 0) + rect.width / 2,
                      y: rect.top - (parent?.top ?? 0) - 8,
                    });
                  };

                  const workingBarEl = (
                    <div
                      className={cn(
                        "relative flex h-full items-center justify-center overflow-hidden rounded-b-sm",
                        barColor
                      )}
                    >
                      {progress > 0 && progress < 100 ? (
                        <div
                          className="absolute inset-y-0 left-0 bg-black/10"
                          style={{ width: `${progress}%` }}
                        />
                      ) : null}
                      {delayLabel ? (
                        <span className="relative z-[1] truncate px-1 text-[10px] font-semibold text-sb-ink/90">
                          {delayLabel}
                        </span>
                      ) : null}
                    </div>
                  );

                  return (
                    <div
                      key={task.id}
                      className="absolute inset-x-0 z-[15]"
                      style={{ top: idx * rowH, height: rowH }}
                      data-gantt-row={task.title}
                    >
                      <div
                        className="absolute cursor-pointer"
                        data-gantt-bar="baseline"
                        style={{
                          top: BASELINE_BAR_TOP,
                          left: `${baselineBar.left}%`,
                          width: `${baselineBar.width}%`,
                          height: BASELINE_BAR_H,
                        }}
                        onMouseEnter={showHover}
                        onMouseLeave={() => setHover(null)}
                      >
                        <div className="h-full rounded-t-sm bg-sb-gantt-baseline" />
                      </div>
                      {task.href && !isPhase ? (
                        <Link
                          href={task.href}
                          className="absolute cursor-pointer"
                          data-gantt-bar="actual"
                          style={{
                            top: WORKING_BAR_TOP,
                            left: `${workingBar.left}%`,
                            width: `${workingBar.width}%`,
                            height: WORKING_BAR_H,
                          }}
                          onMouseEnter={showHover}
                          onMouseLeave={() => setHover(null)}
                        >
                          {workingBarEl}
                        </Link>
                      ) : (
                        <div
                          className="absolute cursor-pointer"
                          data-gantt-bar="actual"
                          style={{
                            top: WORKING_BAR_TOP,
                            left: `${workingBar.left}%`,
                            width: `${workingBar.width}%`,
                            height: WORKING_BAR_H,
                          }}
                          onMouseEnter={showHover}
                          onMouseLeave={() => setHover(null)}
                        >
                          {workingBarEl}
                        </div>
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
          <span className="font-medium text-sb-ink">Overall progress</span>
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
        <p className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-sm bg-sb-gantt-baseline" />
          Original plan
        </p>
        <p className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-sm bg-sb-gantt-progress" />
          Current schedule
        </p>
        <div className="ml-auto flex flex-wrap gap-3">
          {(
            [
              ["Done", counts.COMPLETED, "bg-sb-gantt-done"],
              ["In progress", counts.IN_PROGRESS, "bg-sb-gantt-progress"],
              ["Needs attention", counts.AT_RISK, "bg-sb-gantt-risk"],
              ["Not started", counts.NOT_STARTED, "bg-sb-gantt-planned"],
            ] as const
          ).map(([label, count, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
              {label} ({count})
            </span>
          ))}
        </div>
      </div>

      {hover ? (
        <div
          className="pointer-events-none absolute z-50 w-64 -translate-x-1/2 -translate-y-full rounded-[12px] border border-sb-border bg-white p-3 text-left shadow-lg"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <p className="text-sm font-semibold text-sb-ink">{hover.title}</p>
          <p className="mt-2 text-[12px] text-sb-muted">
            Current schedule:{" "}
            <span className="font-medium text-sb-ink">{hover.dates}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-sb-muted">
            Original plan:{" "}
            <span className="font-medium text-sb-ink">{hover.baseline}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-sb-muted">
            Compared to plan:{" "}
            <span className="font-medium text-sb-ink">{hover.variance}</span>
          </p>
          <p className="mt-2 text-[12px] text-sb-muted">
            Status:{" "}
            <span className="font-medium text-sb-ink">{hover.status}</span>
          </p>
          {hover.assignee ? (
            <p className="mt-0.5 text-[12px] text-sb-muted">
              Who&apos;s doing it:{" "}
              <span className="font-medium text-sb-ink">{hover.assignee}</span>
            </p>
          ) : null}
          {hover.project ? (
            <p className="mt-0.5 text-[12px] text-sb-muted">
              Project:{" "}
              <span className="font-medium text-sb-ink">{hover.project}</span>
            </p>
          ) : null}
          <p className="mt-0.5 text-[12px] text-sb-muted">
            Done:{" "}
            <span className="font-medium text-sb-ink">{hover.progress}%</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
