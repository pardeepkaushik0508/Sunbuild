"use client";

import dynamic from "next/dynamic";
import type { GanttChartProps } from "@/components/schedule/gantt-chart";

/**
 * Lazy Gantt — keeps date-fns / chart DOM out of the initial dashboard JS.
 */
const LazyGantt = dynamic(
  () =>
    import("@/components/schedule/gantt-chart").then((m) => m.GanttChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[280px] w-full items-center justify-center rounded-[16px] border border-sb-border bg-sb-surface text-sm text-sb-muted"
        aria-busy
        aria-label="Loading schedule chart"
      >
        Loading schedule…
      </div>
    ),
  }
);

/** Client-only Gantt wrapper — forces a fresh chunk after timeline UX changes. */
export function GanttChartLazy(props: GanttChartProps) {
  return <LazyGantt key="gantt-v2-simple" {...props} />;
}
