import { SalesKpiSkeleton } from "@/components/sales/sales-kpi-cards";

export default function SalesOverviewLoading() {
  return (
    <div className="w-full space-y-5 pb-8">
      <SalesKpiSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[360px] animate-pulse rounded-[16px] border border-sb-border bg-sb-canvas"
          />
        ))}
      </div>
      <div className="h-[260px] animate-pulse rounded-[16px] border border-sb-border bg-sb-canvas" />
      <div className="h-[200px] animate-pulse rounded-[16px] border border-sb-border bg-sb-canvas" />
    </div>
  );
}
