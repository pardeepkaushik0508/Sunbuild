"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Priority } from "@prisma/client";
import { cn, initials } from "@/lib/utils";

export type HighPriorityItem = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: Date | string | null;
  priority: string;
  projectName?: string;
  projectId?: string;
  assigneeName?: string | null;
  href?: string;
};

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
];

function avatarClass(name?: string | null) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
}

function formatTime(due?: Date | string | null) {
  if (!due) return null;
  const d = new Date(due);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function priorityTone(priority: string) {
  if (
    priority === Priority.HIGH ||
    priority === "HIGH" ||
    priority === "URGENT"
  ) {
    return "bg-rose-50 text-rose-600";
  }
  if (priority === Priority.LOW || priority === "LOW") {
    return "bg-sb-canvas text-sb-muted";
  }
  return "bg-amber-50 text-amber-700";
}

function priorityLabel(priority: string) {
  if (priority === Priority.MEDIUM || priority === "MEDIUM") return "MED";
  if (priority === Priority.HIGH || priority === "HIGH") return "HIGH";
  if (priority === "URGENT") return "URGENT";
  return priority;
}

export function HighPriorityCard({
  items,
  viewAllHref,
  isLoading,
  error,
  onRetry,
}: {
  items: HighPriorityItem[];
  viewAllHref: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-sb-ink">
              High Priority
            </h3>
            <p className="text-[12px] text-sb-muted">
              Critical tasks requiring attention
            </p>
          </div>
        </div>
        <Link
          href={viewAllHref}
          className="rounded-lg bg-[#f3f4f6] px-2.5 py-1.5 text-[12px] font-medium text-sb-ink transition hover:bg-[#e5e7eb]"
        >
          View All
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {isLoading ? (
          <PrioritySkeleton />
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-sb-muted">{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="text-sm font-medium text-sb-blue hover:underline"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-sb-muted">
            No high-priority tasks right now.
          </p>
        ) : (
          items.map((item) => {
            const time = formatTime(item.dueDate);
            return (
              <article
                key={item.id}
                className="rounded-[14px] border border-sb-border bg-sb-surface p-3.5 transition hover:border-sb-orange/40"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                    <AlertTriangle size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-sb-ink">
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="hover:text-sb-orange"
                            >
                              {item.title}
                            </Link>
                          ) : (
                            item.title
                          )}
                        </p>
                        {time ? (
                          <p className="text-[12px] text-sb-muted">{time}</p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          priorityTone(item.priority)
                        )}
                      >
                        {priorityLabel(item.priority)}
                      </span>
                    </div>
                    {(item.description || item.projectName) && (
                      <p className="mt-1 line-clamp-2 text-[12px] text-sb-muted">
                        {item.description || item.projectName}
                      </p>
                    )}
                    {item.assigneeName ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold",
                            avatarClass(item.assigneeName)
                          )}
                        >
                          {initials(item.assigneeName)}
                        </span>
                        <span className="text-[12px] font-medium text-sb-ink">
                          {item.assigneeName}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function PrioritySkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading tasks">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-[14px] border border-sb-border p-3.5"
        >
          <div className="mb-2 flex gap-2.5">
            <div className="h-8 w-8 rounded-full bg-sb-border" />
            <div className="h-4 flex-1 rounded bg-sb-border" />
            <div className="h-5 w-12 rounded bg-sb-border" />
          </div>
          <div className="ml-10 h-3 rounded bg-sb-border" />
          <div className="ml-10 mt-2 h-6 w-28 rounded bg-sb-border" />
        </div>
      ))}
    </div>
  );
}
