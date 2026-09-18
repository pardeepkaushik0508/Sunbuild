import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClientInfoItem = {
  id: string;
  label: string;
  value?: string | null;
  href?: string;
};

export function ClientInfoStrip({
  items,
  viewAllHref,
  className,
  isLoading,
  error,
  emptyMessage = "Select a project to view client information.",
  variant = "cards",
}: {
  items: ClientInfoItem[];
  viewAllHref?: string;
  className?: string;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  /** `pills` matches Sales Manager Overview PDF/Figma tab strip */
  variant?: "cards" | "pills";
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="sb-section-title">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sb-blue-soft text-sb-blue">
            <Lightbulb size={14} />
          </span>
          Client Information
        </div>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-sm font-medium text-sb-blue hover:underline"
          >
            View All
          </Link>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[56px] animate-pulse rounded-[12px] border border-sb-border bg-sb-canvas"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[12px] border border-dashed border-sb-border bg-sb-surface px-4 py-8 text-center text-sm text-sb-muted">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-sb-border bg-sb-surface px-4 py-8 text-center text-sm text-sb-muted">
          {emptyMessage}
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            variant === "pills"
              ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
              : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
          )}
        >
          {items.map((item) => {
            const value = item.value?.trim() || "Not set";
            const inner =
              variant === "pills" ? (
                <div className="flex min-h-[52px] flex-col items-center justify-center rounded-[12px] border border-sb-border bg-[#f3f4f6] px-3 py-2 text-center transition hover:border-sb-blue/40 hover:bg-white">
                  <p className="text-[12px] font-semibold text-sb-ink">
                    {item.label}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-sb-muted">
                    {value}
                  </p>
                </div>
              ) : (
                <div className="flex min-h-[56px] flex-col items-center justify-center rounded-[12px] border border-sb-border bg-sb-surface px-3 py-2.5 text-center shadow-[var(--sb-shadow)] transition hover:border-sb-blue/40">
                  <p className="text-[13px] font-medium text-sb-ink">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-sb-muted">
                    {value}
                  </p>
                </div>
              );
            return item.href ? (
              <Link key={item.id} href={item.href}>
                {inner}
              </Link>
            ) : (
              <div key={item.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
