"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { OwnerTabs } from "@/components/owner/owner-tabs";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NormalizedMicrosoftTodoTask } from "@/lib/microsoft/types";
import type { PublicMicrosoftTodoConnection } from "@/lib/microsoft/types";
import {
  mapMicrosoftTaskToHighPriority,
  type HighPriorityItem,
} from "@/components/dashboard/high-priority-widget";
import { MicrosoftTodoTaskDrawer } from "@/components/dashboard/microsoft-todo-task-drawer";

function formatDue(due?: string | null) {
  if (!due) return "—";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function HighPriorityMicrosoftPageClient({
  connectReturnPath = "/owner/high-priority",
}: {
  connectReturnPath?: string;
}) {
  const [tasks, setTasks] = useState<NormalizedMicrosoftTodoTask[]>([]);
  const [connection, setConnection] =
    useState<PublicMicrosoftTodoConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [selected, setSelected] = useState<HighPriorityItem | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/microsoft/todo/tasks?importance=high${refresh ? "&refresh=1" : ""}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const data = (await res.json()) as {
        tasks?: NormalizedMicrosoftTodoTask[];
        connection?: PublicMicrosoftTodoConnection;
        error?: string | null;
        reconnectRequired?: boolean;
      };
      if (data.connection) setConnection(data.connection);
      setReconnectRequired(Boolean(data.reconnectRequired));
      setTasks(data.tasks ?? []);
      if (data.error) setError(data.error);
    } catch {
      setError("Unable to sync Microsoft To Do.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const endToday = new Date(start);
    endToday.setDate(endToday.getDate() + 1);
    const endWeek = new Date(start);
    endWeek.setDate(endWeek.getDate() + 7);

    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (dueFilter === "overdue" && !t.isOverdue) return false;
      if (dueFilter === "today") {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        if (!(d >= start && d < endToday)) return false;
      }
      if (dueFilter === "week") {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        if (!(d >= start && d < endWeek)) return false;
      }
      if (!q) return true;
      const hay = [t.title, t.description, t.linkedProjectName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, query, statusFilter, dueFilter]);

  const needsConnect =
    !loading &&
    connection &&
    !connection.connected &&
    connection.status !== "RECONNECT_REQUIRED";

  const connectHref = `/api/microsoft/todo/connect?returnTo=${encodeURIComponent(connectReturnPath)}`;

  return (
    <div className="space-y-5">
      <OwnerTabs />
      <PageHeader
        title="High Priority"
        description="Microsoft To Do tasks marked as high importance"
      />

      {needsConnect || reconnectRequired ? (
        <EmptyState
          title={
            reconnectRequired
              ? "Reconnect Microsoft To Do"
              : "Connect Microsoft To Do"
          }
          description={
            reconnectRequired
              ? "Your Microsoft session expired. Reconnect to load high-priority tasks."
              : "Connect your Microsoft account to see high-importance To Do tasks here."
          }
        />
      ) : null}

      {(needsConnect || reconnectRequired) && connection?.configured ? (
        <a
          href={connectHref}
          className="inline-flex h-9 items-center rounded-[8px] border border-sb-yellow bg-sb-yellow px-4 text-sm font-medium text-sb-ink hover:bg-sb-yellow-dark"
        >
          {reconnectRequired ? "Reconnect" : "Connect Microsoft To Do"}
        </a>
      ) : null}

      {!needsConnect && !reconnectRequired ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border border-sb-border bg-sb-surface px-3 text-sm text-sb-muted">
              <Search size={15} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-[10px] border border-sb-border bg-sb-surface px-3 text-sm text-sb-ink"
              aria-label="Status filter"
            >
              <option value="all">All statuses</option>
              <option value="notStarted">Not started</option>
              <option value="inProgress">In progress</option>
              <option value="waitingOnOthers">Waiting</option>
              <option value="deferred">Deferred</option>
            </select>
            <select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value)}
              className="h-10 rounded-[10px] border border-sb-border bg-sb-surface px-3 text-sm text-sb-ink"
              aria-label="Due date filter"
            >
              <option value="all">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Due this week</option>
            </select>
            <button
              type="button"
              onClick={() => void load(true)}
              className="h-10 rounded-[10px] border border-sb-border bg-sb-surface px-3 text-sm font-medium text-sb-ink hover:bg-sb-canvas"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-sb-muted">Loading…</p>
          ) : error && filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-sb-muted">{error}</p>
              <button
                type="button"
                onClick={() => void load(true)}
                className="mt-2 text-sm font-medium text-sb-blue hover:underline"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No high priority tasks."
              description="Tasks marked high importance in Microsoft To Do will appear here."
            />
          ) : (
            <div className="overflow-hidden rounded-[16px] border border-sb-border bg-sb-surface shadow-[var(--sb-shadow)]">
              <ul className="divide-y divide-sb-border">
                {filtered.map((task) => {
                  const item = mapMicrosoftTaskToHighPriority(task);
                  return (
                    <li key={task.microsoftTaskId}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-sb-canvas sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        onClick={() => setSelected(item)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-sb-ink">
                            {task.title}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-sb-muted">
                            {task.linkedProjectName ||
                              task.description ||
                              "Microsoft To Do"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {task.isOverdue ? (
                            <StatusBadge tone="danger">Overdue</StatusBadge>
                          ) : null}
                          <StatusBadge tone="danger">HIGH</StatusBadge>
                          <span
                            className={cn(
                              "text-[12px]",
                              task.isOverdue
                                ? "font-medium text-rose-600"
                                : "text-sb-muted"
                            )}
                          >
                            {formatDue(task.dueDate)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : null}

      {selected ? (
        <MicrosoftTodoTaskDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onCompleted={() => {
            setSelected(null);
            void load(true);
          }}
        />
      ) : null}
    </div>
  );
}
