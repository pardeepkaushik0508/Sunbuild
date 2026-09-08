import Link from "next/link";
import type { PipelineStage } from "@/lib/dashboard/load-sales-overview";

export function SalesPipeline({
  stages,
  error,
}: {
  stages: PipelineStage[];
  error?: string | null;
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <section className="rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)] sm:p-6">
      <div className="mb-5">
        <h3 className="text-[16px] font-semibold text-sb-ink">Sales Pipeline</h3>
        <p className="mt-0.5 text-[12px] text-sb-muted">
          Lead volume by pipeline stage
        </p>
      </div>

      {error ? (
        <p className="py-8 text-center text-sm text-sb-muted">{error}</p>
      ) : stages.every((s) => s.count === 0) ? (
        <p className="py-8 text-center text-sm text-sb-muted">
          No pipeline records yet. Create leads to populate this chart.
        </p>
      ) : (
        <div className="space-y-5">
          {stages.map((stage) => {
            const pct = Math.max(6, Math.round((stage.count / max) * 100));
            // PDF two-tone: amber left share shrinks as volume drops, purple fills remainder.
            const amberShare = Math.max(18, Math.round(55 * (stage.count / max)));
            return (
              <Link
                key={stage.key}
                href={stage.href}
                className="group block"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[14px] font-medium text-sb-ink transition group-hover:text-sb-orange">
                    {stage.label}
                  </span>
                  <span className="text-[13px] font-medium text-sb-muted">
                    {stage.count} Lead{stage.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-3.5 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
                  <div
                    className="flex h-full overflow-hidden rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  >
                    <span
                      className="h-full bg-[#f97316]"
                      style={{ width: `${amberShare}%` }}
                    />
                    <span
                      className="h-full bg-[#8b5cf6]"
                      style={{ width: `${100 - amberShare}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
