import Link from "next/link";
import {
  AlertTriangle,
  CircleDollarSign,
  FileText,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InsightSeverity = "HIGH" | "MEDIUM" | "NEW" | "LOW";

export type InsightCard = {
  id: string;
  category: string;
  severity: InsightSeverity;
  message: string;
  href?: string;
  actionLabel?: string;
  /** Secondary line e.g. Confidence / Next Due / Due date */
  meta?: string;
};

const severityStyles: Record<
  InsightSeverity,
  { badge: string; iconWrap: string; Icon: typeof AlertTriangle }
> = {
  HIGH: {
    badge: "bg-sb-red-soft text-sb-red",
    iconWrap: "bg-sb-red-soft text-sb-red",
    Icon: AlertTriangle,
  },
  MEDIUM: {
    badge: "bg-sb-green-soft text-sb-green-dark",
    iconWrap: "bg-sb-green-soft text-sb-green-dark",
    Icon: CircleDollarSign,
  },
  NEW: {
    badge: "bg-sb-blue-soft text-sb-blue",
    iconWrap: "bg-sb-blue-soft text-sb-blue",
    Icon: FileText,
  },
  LOW: {
    badge: "bg-sb-canvas text-sb-muted",
    iconWrap: "bg-sb-canvas text-sb-muted",
    Icon: Lightbulb,
  },
};

export function AiInsightsPanel({
  insights,
  viewAllHref,
  className,
}: {
  insights: InsightCard[];
  viewAllHref?: string;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="sb-section-title">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sb-blue-soft text-sb-blue">
            <Lightbulb size={16} />
          </span>
          AI Insights & Recommendations
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

      {insights.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-sb-border bg-sb-surface px-4 py-8 text-center text-sm text-sb-muted">
          No insights right now — schedule and deposits look healthy.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {insights.map((insight) => {
            const style = severityStyles[insight.severity];
            const Icon = style.Icon;
            return (
              <div
                key={insight.id}
                className="rounded-[12px] border border-sb-border bg-sb-surface p-4 shadow-[var(--sb-shadow)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-full",
                        style.iconWrap
                      )}
                    >
                      <Icon size={16} />
                    </span>
                    <p className="text-sm font-semibold text-sb-ink">
                      {insight.category}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      style.badge
                    )}
                  >
                    {insight.severity}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-snug text-sb-body">
                  {insight.message}
                </p>
                {insight.meta ? (
                  <p className="mt-2 text-[12px] font-medium text-sb-muted">
                    {insight.meta}
                  </p>
                ) : null}
                {insight.href ? (
                  <Link
                    href={insight.href}
                    className="mt-3 inline-block text-sm font-medium text-sb-blue hover:underline"
                  >
                    {insight.actionLabel ?? "View Details"}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
