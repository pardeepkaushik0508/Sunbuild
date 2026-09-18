/**
 * Single source of truth for Gantt baseline vs current/actual variance.
 * Uses UTC calendar days so timezone offsets do not shift day counts.
 */

export type VarianceKind = "late" | "early" | "on_time" | "unknown";

export type ScheduleVariance = {
  days: number | null;
  kind: VarianceKind;
  signedLabel: string;
  proseLabel: string;
  isForecast: boolean;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** UTC calendar-day difference: end − start. Oct 25 − Oct 20 = +5. */
export function calendarDaysUtc(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): number | null {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return null;
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

export function formatVarianceDays(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "On time";
  const abs = Math.abs(days);
  const unit = abs === 1 ? "day" : "days";
  if (days > 0) return `+${days} ${unit}`;
  return `−${abs} ${unit}`;
}

export function formatVarianceProse(
  days: number | null,
  opts?: { forecast?: boolean }
): string {
  if (days == null) return "Variance unknown";
  if (days === 0) return "On time";
  const abs = Math.abs(days);
  const unit = abs === 1 ? "day" : "days";
  if (days > 0) {
    return opts?.forecast ? `${abs} ${unit} late (forecast)` : `${abs} ${unit} late`;
  }
  return opts?.forecast ? `${abs} ${unit} early (forecast)` : `${abs} ${unit} early`;
}

/**
 * Working (display) end:
 * - COMPLETED with actual end → actual (final)
 * - otherwise current/forecast end
 */
export function resolveWorkingEnd(input: {
  status?: string | null;
  currentEnd?: Date | string | null;
  actualEnd?: Date | string | null;
}): Date | null {
  const status = String(input.status ?? "").toUpperCase();
  const completed =
    status === "COMPLETED" || status === "DONE";
  if (completed) {
    return toDate(input.actualEnd) ?? toDate(input.currentEnd);
  }
  return toDate(input.currentEnd) ?? toDate(input.actualEnd);
}

export function resolveWorkingStart(input: {
  status?: string | null;
  currentStart?: Date | string | null;
  actualStart?: Date | string | null;
}): Date | null {
  const status = String(input.status ?? "").toUpperCase();
  const completed =
    status === "COMPLETED" || status === "DONE";
  if (completed) {
    return toDate(input.actualStart) ?? toDate(input.currentStart);
  }
  return toDate(input.currentStart) ?? toDate(input.actualStart);
}

/**
 * varianceDays = actualOrCurrentEnd − baselineEnd
 * Positive = late, negative = early, 0 = on time.
 */
export function calculateScheduleVariance(input: {
  baselineEnd?: Date | string | null;
  currentEnd?: Date | string | null;
  actualEnd?: Date | string | null;
  status?: string | null;
}): ScheduleVariance {
  const status = String(input.status ?? "").toUpperCase();
  const completed = status === "COMPLETED" || status === "DONE";
  const workingEnd = resolveWorkingEnd(input);
  const days = calendarDaysUtc(input.baselineEnd, workingEnd);
  const isForecast = !completed;
  if (days == null) {
    return {
      days: null,
      kind: "unknown",
      signedLabel: "—",
      proseLabel: "Variance unknown",
      isForecast,
    };
  }
  const kind: VarianceKind =
    days > 0 ? "late" : days < 0 ? "early" : "on_time";
  return {
    days,
    kind,
    signedLabel: formatVarianceDays(days),
    proseLabel: formatVarianceProse(days, { forecast: isForecast }),
    isForecast,
  };
}

export function establishBaselineDates(input: {
  existingBaselineStart?: Date | string | null;
  existingBaselineEnd?: Date | string | null;
  start?: Date | string | null;
  end?: Date | string | null;
}): { baselineStart: Date | null; baselineEnd: Date | null } {
  return {
    baselineStart:
      toDate(input.existingBaselineStart) ?? toDate(input.start),
    baselineEnd: toDate(input.existingBaselineEnd) ?? toDate(input.end),
  };
}
