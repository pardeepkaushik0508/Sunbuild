import { differenceInCalendarDays } from "date-fns";

export type GanttViewMode = "day" | "week" | "month";

export type GanttScalePlan = {
  /** Primary heading grouping. */
  primary: "day" | "week" | "month";
  /** Optional secondary ticks. */
  secondary: "none" | "day" | "week";
  /** Minimum pixel width per primary column. */
  colMinWidth: number;
  reason: string;
};

/**
 * Adaptive Gantt timeline for the selected date range.
 * An explicit Day / Week / Month choice always wins; auto-scale is only used
 * when the user has not picked a view.
 */
export function resolveGanttScale(
  rangeStart: Date,
  rangeEnd: Date,
  preferred?: GanttViewMode | null
): GanttScalePlan {
  const spanDays = Math.max(
    1,
    differenceInCalendarDays(rangeEnd, rangeStart) + 1
  );

  if (preferred === "month") {
    return {
      primary: "month",
      secondary: spanDays <= 150 ? "week" : "none",
      colMinWidth: 110,
      reason: "preferred-month",
    };
  }
  if (preferred === "week") {
    return {
      primary: "week",
      secondary: "none",
      colMinWidth: 72,
      reason: "preferred-week",
    };
  }
  if (preferred === "day") {
    return {
      primary: "day",
      secondary: "none",
      colMinWidth: spanDays > 90 ? 28 : 36,
      reason: "preferred-day",
    };
  }

  if (spanDays <= 21) {
    return {
      primary: "day",
      secondary: "none",
      colMinWidth: 36,
      reason: "short-range-daily",
    };
  }
  if (spanDays <= 62) {
    // ~2 months: month headings with weekly subdivisions.
    return {
      primary: "month",
      secondary: "week",
      colMinWidth: 96,
      reason: "medium-range-month-week",
    };
  }
  return {
    primary: "month",
    secondary: spanDays <= 150 ? "week" : "none",
    colMinWidth: 110,
    reason: "long-range-monthly",
  };
}

export const GANTT_BODY_MAX_VISIBLE_ROWS = 12;
export const GANTT_ROW_HEIGHT_DUAL = 68;
export const GANTT_HEADER_HEIGHT_DAY = 56;
export const GANTT_HEADER_HEIGHT = 44;
