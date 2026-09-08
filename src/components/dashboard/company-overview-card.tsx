import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";

export type CompanyMetric = {
  label: string;
  value: string | number;
  accent: "blue" | "green" | "purple" | "orange" | "red" | "indigo";
};

const accentBar: Record<CompanyMetric["accent"], string> = {
  blue: "bg-[#3b82f6]",
  green: "bg-[#10b981]",
  purple: "bg-[#8b5cf6]",
  orange: "bg-[#f97316]",
  red: "bg-[#ef4444]",
  indigo: "bg-[#6366f1]",
};

export function CompanyOverviewCard({
  name,
  tagline,
  status = "Active",
  metrics,
  detailsHref,
  className,
}: {
  name: string;
  tagline: string;
  status?: string;
  metrics: CompanyMetric[];
  detailsHref: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.06)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#dbeafe] text-[#2563eb]">
            <Building2 size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[17px] font-semibold tracking-tight text-[#111827]">
                {name}
              </h3>
              <StatusBadge tone="success">{status}</StatusBadge>
            </div>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">{tagline}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-[#e5e7eb] sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={cn(
              "relative min-w-0 px-4 py-4 sm:px-5",
              i > 0 && "border-t border-[#e5e7eb] sm:border-t-0 sm:border-l"
            )}
          >
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-[3px]",
                accentBar[m.accent]
              )}
            />
            <p className="text-[11px] font-medium tracking-[0.06em] text-[#9ca3af] uppercase">
              {m.label}
            </p>
            <p className="mt-2 text-[28px] leading-none font-bold tracking-tight text-[#111827]">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-4 text-[13px] text-[#6b7280]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            On Track
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#f97316]" />
            At Risk
          </span>
        </div>
        <Link
          href={detailsHref}
          className="text-[13px] font-medium text-[#111827] transition hover:text-[#f97316]"
        >
          View Details →
        </Link>
      </div>
    </section>
  );
}
