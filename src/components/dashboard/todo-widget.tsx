"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Plus,
  Search,
} from "lucide-react";
import { Priority } from "@prisma/client";
import { cn, initials } from "@/lib/utils";
import { AddTaskDialog } from "@/components/dashboard/add-task-dialog";
import dynamic from "next/dynamic";

const AddSalesFollowUpDialog = dynamic(
  () =>
    import("@/components/sales/add-sales-followup-dialog").then(
      (m) => m.AddSalesFollowUpDialog
    ),
  { ssr: false }
);

export type TodoItem = {
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
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
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

export function TodoWidget({
  items,
  viewAllHref,
  addHref,
  projects = [],
  assignees = [],
  leads = [],
  defaultProjectId,
  enableCreate = false,
  enableSalesCreate = false,
}: {
  items: TodoItem[];
  viewAllHref: string;
  addHref?: string;
  projects?: Array<{ id: string; name: string }>;
  assignees?: Array<{ id: string; name: string }>;
  leads?: Array<{ id: string; name: string }>;
  defaultProjectId?: string | null;
  enableCreate?: boolean;
  enableSalesCreate?: boolean;
}) {
  const canCreate =
    (enableCreate && projects.length > 0) ||
    (enableSalesCreate && leads.length > 0);
  const [tab, setTab] = useState<"today" | "week">("today");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced(value.trim().toLowerCase());
    }, 220);
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const endToday = new Date(start);
    endToday.setDate(endToday.getDate() + 1);
    const endWeek = new Date(start);
    endWeek.setDate(endWeek.getDate() + 7);

    return items.filter((item) => {
      if (item.dueDate) {
        const d = new Date(item.dueDate);
        if (tab === "today") {
          if (!(d >= start && d < endToday)) return false;
        } else if (!(d >= start && d < endWeek)) {
          return false;
        }
      } else if (tab === "today") {
        return false;
      }

      if (!debounced) return true;
      const hay = [
        item.title,
        item.description,
        item.projectName,
        item.assigneeName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(debounced);
    });
  }, [items, tab, debounced]);

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-sb-ink">To Do List</h3>
            <p className="text-[12px] text-sb-muted">
              Critical tasks requiring attention
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={viewAllHref}
            className="rounded-lg bg-[#f3f4f6] px-2.5 py-1.5 text-[12px] font-medium text-sb-ink hover:bg-[#e5e7eb]"
          >
            View All
          </Link>
          {canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#fbbf24] px-2.5 py-1.5 text-[12px] font-semibold text-sb-ink hover:bg-[#f59e0b]"
            >
              <Plus size={12} />
              Add New
            </button>
          ) : addHref ? (
            <Link
              href={addHref}
              className="inline-flex items-center gap-1 rounded-lg bg-[#fbbf24] px-2.5 py-1.5 text-[12px] font-semibold text-sb-ink"
            >
              <Plus size={12} />
              Add New
            </Link>
          ) : null}
        </div>
      </div>

      <label className="mb-3 flex h-10 items-center gap-2 rounded-[10px] border border-sb-border bg-sb-surface px-3 text-sm text-sb-muted">
        <Search size={15} className="shrink-0" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-sb-muted"
          aria-label="Search tasks"
        />
        <kbd className="hidden rounded border border-sb-border bg-sb-canvas px-1.5 py-0.5 text-[10px] sm:inline">
          /
        </kbd>
      </label>

      <div
        className="mb-3 flex gap-5 border-b border-sb-border"
        role="tablist"
        aria-label="Task timeframe"
      >
        {(["today", "week"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-0.5 pb-2 text-[13px] font-semibold transition",
              tab === key
                ? "border-[#facc15] text-sb-ink"
                : "border-transparent text-sb-muted hover:text-sb-ink"
            )}
          >
            {key === "today" ? "Today" : "Week"}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-sb-muted">
            {debounced
              ? "No matching tasks."
              : `No tasks for ${tab === "today" ? "today" : "this week"}.`}
          </p>
        ) : (
          filtered.map((item) => {
            const time = formatTime(item.dueDate);
            return (
              <article
                key={item.id}
                className="rounded-[14px] border border-sb-border bg-sb-surface p-3.5"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                    <Building2 size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-sb-ink">
                          {item.href ? (
                            <Link href={item.href} className="hover:text-sb-orange">
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
                          item.priority === Priority.HIGH ||
                            item.priority === "HIGH" ||
                            item.priority === "URGENT"
                            ? "bg-rose-50 text-rose-600"
                            : item.priority === Priority.LOW ||
                                item.priority === "LOW"
                              ? "bg-sb-canvas text-sb-muted"
                              : "bg-amber-50 text-amber-700"
                        )}
                      >
                        {item.priority}
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

      {canCreate && enableSalesCreate ? (
        <AddSalesFollowUpDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          leads={leads}
          assignees={assignees}
        />
      ) : null}
      {canCreate && enableCreate && !enableSalesCreate ? (
        <AddTaskDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          projects={projects}
          assignees={assignees}
          defaultProjectId={defaultProjectId}
        />
      ) : null}
    </section>
  );
}
