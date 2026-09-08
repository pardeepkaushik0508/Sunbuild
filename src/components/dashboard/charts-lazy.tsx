"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const chartLoading = (
  <div
    className="flex h-[180px] w-full items-center justify-center rounded-[16px] border border-sb-border bg-white text-sm text-sb-muted"
    aria-busy
    aria-label="Loading chart"
  >
    Loading chart…
  </div>
);

export const StatusDonutChart = dynamic(
  () =>
    import("@/components/dashboard/charts").then((m) => m.StatusDonutChart),
  { ssr: false, loading: () => chartLoading }
);

export const MetricBarChart = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.MetricBarChart),
  { ssr: false, loading: () => chartLoading }
);

export type StatusDonutChartProps = ComponentProps<typeof StatusDonutChart>;
export type MetricBarChartProps = ComponentProps<typeof MetricBarChart>;
