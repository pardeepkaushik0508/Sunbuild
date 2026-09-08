"use client";

import {
  BarChart3,
  CheckSquare,
  FileText,
  Home,
  Rocket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SalesKpi } from "@/lib/dashboard/load-sales-overview";

const ACCENT: Record<
  SalesKpi["accent"],
  { wrap: string; icon: string; spark: string }
> = {
  blue: {
    wrap: "bg-[#eff6ff]",
    icon: "text-[#3b82f6]",
    spark: "#3b82f6",
  },
  purple: {
    wrap: "bg-[#f5f3ff]",
    icon: "text-[#8b5cf6]",
    spark: "#8b5cf6",
  },
  green: {
    wrap: "bg-[#ecfdf5]",
    icon: "text-[#10b981]",
    spark: "#10b981",
  },
  amber: {
    wrap: "bg-[#fffbeb]",
    icon: "text-[#f59e0b]",
    spark: "#f59e0b",
  },
  slate: {
    wrap: "bg-[#f3f4f6]",
    icon: "text-[#374151]",
    spark: "#6b7280",
  },
  rose: {
    wrap: "bg-[#fff1f2]",
    icon: "text-[#f43f5e]",
    spark: "#f43f5e",
  },
};

const ICONS = {
  home: Home,
  file: FileText,
  rocket: Rocket,
  bag: Wallet,
  check: CheckSquare,
  chart: BarChart3,
};

/** Decorative sparkline matching PDF chrome — not a fake KPI series. */
function Sparkline({ color }: { color: string }) {
  return (
    <svg
      width="48"
      height="18"
      viewBox="0 0 48 18"
      fill="none"
      aria-hidden
      className="opacity-80"
    >
      <path
        d="M1 14 L8 11 L15 13 L22 7 L29 9 L36 4 L47 6"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SalesKpiCards({
  kpis,
  error,
}: {
  kpis: SalesKpi[];
  error?: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-[16px] border border-dashed border-sb-border bg-sb-surface px-4 py-8 text-center text-sm text-sb-muted">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((kpi) => {
        const Icon = ICONS[kpi.icon];
        const accent = ACCENT[kpi.accent];
        const hasGrowth = Boolean(kpi.growth && kpi.growth !== "—");
        return (
          <article
            key={kpi.id}
            className="rounded-[16px] border border-sb-border bg-sb-surface p-4 shadow-[var(--sb-shadow)]"
          >
            <div
              className={cn(
                "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full",
                accent.wrap,
                accent.icon
              )}
            >
              <Icon size={18} strokeWidth={2} />
            </div>
            <p className="text-[12px] font-medium leading-tight text-sb-muted">
              {kpi.label}
            </p>
            <p className="mt-1.5 text-[24px] font-bold leading-none tracking-tight text-sb-ink">
              {kpi.value}
            </p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <Sparkline color={accent.spark} />
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-semibold",
                  hasGrowth ? "text-emerald-600" : "text-sb-muted"
                )}
              >
                {hasGrowth ? <TrendingUp size={11} /> : null}
                {kpi.growth ?? "—"}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function SalesKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[132px] animate-pulse rounded-[16px] border border-sb-border bg-sb-canvas"
        />
      ))}
    </div>
  );
}
