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
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
  AT_RISK: "At Risk",
  NOT_STARTED: "Not Started",
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
        end: addDays(customStart, view === "month" ? 60 : 30),
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
  }, [visible, idToIndex, range, headerH, rowH]);

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sb-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
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
              Fit tasks
            </button>
            {rangeFrom || rangeTo ? (
              <button
                type="button"
                onClick={clearCustomRange}
                className="h-8 rounded-[8px] px-2 text-[12px] font-medium text-sb-muted hover:text-sb-ink"
              >
                Reset
              </button>
            ) : null}
          </div>
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
                              !isPhase ? task.variance.signedLabel : null,
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
                  No tasks or schedule items yet. Add a task with start/due dates
                  to see it here.
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
                  const barColor = task.isCritical
                    ? "bg-sb-gantt-critical"
                    : STATUS_COLOR[task.status];

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
                      dates: `${format(workingStart, "MMM d, yyyy")} – ${format(workingEnd, "MMM d, yyyy")} (${days} day${days === 1 ? "" : "s"})`,
                      baseline: `${format(task.baselineStart, "MMM d, yyyy")} – ${format(task.baselineEnd, "MMM d, yyyy")}`,
                      variance: task.variance.proseLabel,
                      progress: Math.round(progress),
                      x: rect.left - (parent?.left ?? 0) + rect.width / 2,
                      y: rect.top - (parent?.top ?? 0) - 8,
                    });
                  };

                  if (isPhase) {
                    return (
                      <div
                        key={task.id}
                        className="absolute z-[15]"
                        style={{
                          top: idx * rowH + 22,
                          left: `${workingBar.left}%`,
                          width: `${workingBar.width}%`,
                          height: 18,
                        }}
                      >
                        <div className="h-full overflow-hidden rounded-md bg-sb-gantt-phase opacity-90 shadow-sm" />
                      </div>
                    );
                  }

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
                          top: 12,
                          left: `${baselineBar.left}%`,
                          width: `${baselineBar.width}%`,
                          height: 12,
                        }}
                        onMouseEnter={showHover}
                        onMouseLeave={() => setHover(null)}
                      >
                        <div className="h-full overflow-hidden rounded-sm bg-slate-400/70 ring-1 ring-slate-500/30" />
                      </div>
                      {task.href ? (
                        <Link
                          href={task.href}
                          className="absolute cursor-pointer"
                          data-gantt-bar="actual"
                          style={{
                            top: 28,
                            left: `${workingBar.left}%`,
                            width: `${workingBar.width}%`,
                            height: 14,
                          }}
                          onMouseEnter={showHover}
                          onMouseLeave={() => setHover(null)}
                        >
                          <div
                            className={cn(
                              "relative h-full overflow-hidden rounded-md shadow-sm",
                              barColor
                            )}
                          >
                            {progress > 0 && progress < 100 ? (
                              <div
                                className="absolute inset-y-0 left-0 bg-black/15"
                                style={{ width: `${progress}%` }}
                              />
                            ) : null}
                          </div>
                        </Link>
                      ) : (
                        <div
                          className="absolute cursor-pointer"
                          data-gantt-bar="actual"
                          style={{
                            top: 28,
                            left: `${workingBar.left}%`,
                            width: `${workingBar.width}%`,
                            height: 14,
                          }}
                          onMouseEnter={showHover}
                          onMouseLeave={() => setHover(null)}
                        >
                          <div
                            className={cn(
                              "relative h-full overflow-hidden rounded-md shadow-sm",
                              barColor
                            )}
                          />
                        </div>
                      )}
                      {task.variance.days != null && task.variance.days !== 0 ? (
                        <span
                          className={cn(
                            "pointer-events-none absolute text-[10px] font-semibold",
                            task.variance.kind === "late"
                              ? "text-sb-gantt-risk"
                              : "text-sb-gantt-done"
                          )}
                          style={{
                            top: 44,
                            left: `calc(${workingBar.left}% + ${workingBar.width}% + 6px)`,
                          }}
                        >
                          {task.variance.signedLabel}
                        </span>
                      ) : null}
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
          <span className="h-2 w-5 rounded-sm bg-slate-400/70" />
          Baseline
        </p>
        <p className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-sm bg-sb-gantt-progress" />
          Current / Actual
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

      {hover ? (
        <div
          className="pointer-events-none absolute z-50 w-64 -translate-x-1/2 -translate-y-full rounded-[12px] border border-sb-border bg-white p-3 text-left shadow-lg"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <p className="text-sm font-semibold text-sb-ink">{hover.title}</p>
          <p className="mt-1 text-[12px] text-sb-muted">{hover.dates}</p>
          <p className="mt-0.5 text-[12px] text-sb-muted">
            Baseline:{" "}
            <span className="font-medium text-sb-ink">{hover.baseline}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-sb-muted">
            Variance:{" "}
            <span className="font-medium text-sb-ink">{hover.variance}</span>
          </p>
          <p className="mt-1 text-[12px] text-sb-muted">
            Status: <span className="font-medium text-sb-ink">{hover.status}</span>
          </p>
          {hover.assignee ? (
            <p className="mt-0.5 text-[12px] text-sb-muted">
              Assignee:{" "}
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
            Progress:{" "}
            <span className="font-medium text-sb-ink">{hover.progress}%</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
