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
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="sb-section-title">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sb-blue-soft text-sb-blue">
            <Lightbulb size={16} />
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[72px] animate-pulse rounded-[12px] border border-sb-border bg-sb-canvas"
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
            "grid gap-3",
            variant === "pills"
              ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
              : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
          )}
        >
          {items.map((item) => {
            const inner =
              variant === "pills" ? (
                <div className="flex min-h-[64px] flex-col items-center justify-center rounded-[12px] border border-sb-border bg-[#f3f4f6] px-3 py-3 text-center transition hover:border-sb-blue/40 hover:bg-white">
                  <p className="text-[13px] font-semibold text-sb-ink">
                    {item.label}
                  </p>
                  {item.value ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-sb-muted">
                      {item.value}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[72px] flex-col items-center justify-center rounded-[12px] border border-sb-border bg-sb-surface px-3 py-4 text-center shadow-[var(--sb-shadow)] transition hover:border-sb-blue/40">
                  <p className="text-sm font-medium text-sb-ink">{item.label}</p>
                  {item.value ? (
                    <p className="mt-1 line-clamp-2 text-xs text-sb-muted">
                      {item.value}
                    </p>
                  ) : null}
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
