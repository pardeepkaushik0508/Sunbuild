"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { NormalizedMicrosoftTodoTask } from "@/lib/microsoft/types";
import type { PublicMicrosoftTodoConnection } from "@/lib/microsoft/types";
import { MicrosoftTodoTaskDrawer } from "@/components/dashboard/microsoft-todo-task-drawer";

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
  source?: "MICROSOFT_TODO" | "SUNBUILD_TASK";
  isOverdue?: boolean;
  microsoftTaskId?: string;
  microsoftListId?: string;
  webLink?: string | null;
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

function formatDue(due?: Date | string | null) {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - start.getTime()) / 86400000);

  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;

  if (diff === 0) return hasTime ? time : "Today";
  if (diff === 1) return hasTime ? `Tomorrow ${time}` : "Tomorrow";
  if (diff < 0) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(d);
}

function importanceToPriority(importance: string): string {
  if (importance === "high") return "HIGH";
  if (importance === "low") return "LOW";
  return "MED";
}

export function mapMicrosoftTaskToHighPriority(
  t: NormalizedMicrosoftTodoTask
): HighPriorityItem {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    priority: importanceToPriority(t.importance),
    projectName: t.linkedProjectName ?? undefined,
    projectId: t.linkedProjectId ?? undefined,
    assigneeName: null,
    source: "MICROSOFT_TODO",
    isOverdue: t.isOverdue,
    microsoftTaskId: t.microsoftTaskId,
    microsoftListId: t.microsoftListId,
    webLink: t.webLink,
  };
}

export function HighPriorityCard({
  items,
  viewAllHref,
  isLoading,
  error,
  onRetry,
  connectHref,
  needsConnect,
  reconnectRequired,
}: {
  items: HighPriorityItem[];
  viewAllHref: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  connectHref?: string;
  needsConnect?: boolean;
  reconnectRequired?: boolean;
}) {
  const [selected, setSelected] = useState<HighPriorityItem | null>(null);

  return (
    <section className="flex h-full min-h-[280px] max-h-[70vh] flex-col rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)] sm:min-h-[320px] sm:max-h-[420px] xl:max-h-none xl:h-[420px]">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
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

      <div className="sb-task-scroll min-h-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">
        {isLoading ? (
          <PrioritySkeleton />
        ) : needsConnect || reconnectRequired ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-sb-muted">
              {reconnectRequired
                ? "Reconnect Microsoft To Do to see high-priority tasks."
                : "Connect Microsoft To Do to see high-priority tasks."}
            </p>
            {connectHref ? (
              <a
                href={connectHref}
                className="rounded-lg bg-[#fbbf24] px-3 py-1.5 text-sm font-semibold text-sb-ink hover:bg-[#f59e0b]"
              >
                {reconnectRequired
                  ? "Reconnect Microsoft To Do"
                  : "Connect Microsoft To Do"}
              </a>
            ) : null}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
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
          <p className="py-8 text-center text-sm text-sb-muted">
            No high priority tasks.
          </p>
        ) : (
          items.map((item) => {
            const due = formatDue(item.dueDate);
            return (
              <article
                key={item.id}
                className="cursor-pointer rounded-[12px] border border-sb-border bg-sb-surface px-3 py-2 transition hover:border-sb-orange/40"
                onClick={() => setSelected(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(item);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-sb-ink">
                    {item.title}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.isOverdue ? (
                      <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-600">
                        Overdue
                      </span>
                    ) : null}
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
                      HIGH
                    </span>
                  </div>
                </div>
                {due ? (
                  <p
                    className={cn(
                      "mt-0.5 text-[12px]",
                      item.isOverdue ? "font-medium text-rose-600" : "text-sb-muted"
                    )}
                  >
                    {due}
                  </p>
                ) : null}
                {(item.description || item.projectName) && (
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-sb-muted">
                    {item.projectName
                      ? item.description
                        ? `${item.projectName} · ${item.description}`
                        : item.projectName
                      : item.description}
                  </p>
                )}
                {item.assigneeName ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold",
                        avatarClass(item.assigneeName)
                      )}
                    >
                      {initials(item.assigneeName)}
                    </span>
                    <span className="truncate text-[12px] font-medium text-sb-ink">
                      {item.assigneeName}
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {selected ? (
        <MicrosoftTodoTaskDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onCompleted={() => {
            setSelected(null);
            onRetry?.();
          }}
        />
      ) : null}
    </section>
  );
}

/** Client card that loads Microsoft To Do high-priority tasks via SUNBUILD API. */
export function HighPriorityMicrosoftCard({
  viewAllHref,
  connectReturnPath = "/owner",
  initialConnection,
}: {
  viewAllHref: string;
  connectReturnPath?: string;
  initialConnection?: PublicMicrosoftTodoConnection | null;
}) {
  const initiallyConnected = Boolean(initialConnection?.connected);
  const [items, setItems] = useState<HighPriorityItem[]>([]);
  const [isLoading, setIsLoading] = useState(initiallyConnected);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] =
    useState<PublicMicrosoftTodoConnection | null>(initialConnection ?? null);
  const [reconnectRequired, setReconnectRequired] = useState(
    initialConnection?.status === "RECONNECT_REQUIRED"
  );

  const load = useCallback(async (refresh = false) => {
    setIsLoading(true);
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
      // Public connection payload only — never tokens/secrets.
      if (data.connection) {
        setConnection({
          connected: Boolean(data.connection.connected),
          status: data.connection.status,
          email: data.connection.email ?? null,
          configured: Boolean(data.connection.configured),
        });
      }
      setReconnectRequired(Boolean(data.reconnectRequired));
      if (data.error && !(data.tasks && data.tasks.length)) {
        setError(data.error);
        setItems([]);
      } else {
        setError(data.error ?? null);
        setItems((data.tasks ?? []).map(mapMicrosoftTaskToHighPriority));
      }
    } catch {
      setError("Unable to sync Microsoft To Do.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip Graph fetch until the user has connected (or needs reconnect).
    if (
      initialConnection &&
      !initialConnection.connected &&
      initialConnection.status !== "RECONNECT_REQUIRED"
    ) {
      setIsLoading(false);
      setConnection(initialConnection);
      return;
    }
    void load(false);
  }, [load, initialConnection]);

  const needsConnect =
    !connection?.connected &&
    !reconnectRequired &&
    !isLoading &&
    connection?.status !== "RECONNECT_REQUIRED" &&
    (connection == null ||
      connection.status === "NOT_CONNECTED" ||
      connection.status === "DISCONNECTED" ||
      connection.status === "ERROR");

  const showConnect =
    (needsConnect || reconnectRequired) && connection?.configured !== false;

  const connectHref = `/api/microsoft/todo/connect?returnTo=${encodeURIComponent(connectReturnPath)}`;

  return (
    <HighPriorityCard
      items={items}
      viewAllHref={viewAllHref}
      isLoading={isLoading}
      error={
        connection && !connection.configured && !isLoading
          ? "Microsoft To Do is not configured on this server."
          : error
      }
      onRetry={() => void load(true)}
      connectHref={
        connection?.configured === false ? undefined : connectHref
      }
      needsConnect={showConnect && !error}
      reconnectRequired={reconnectRequired}
    />
  );
}

function PrioritySkeleton() {
  return (
    <div className="space-y-1.5" aria-busy="true" aria-label="Loading tasks">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-[12px] border border-sb-border px-3 py-2"
        >
          <div className="mb-1.5 flex gap-2">
            <div className="h-4 flex-1 rounded bg-sb-border" />
            <div className="h-4 w-10 rounded bg-sb-border" />
          </div>
          <div className="h-3 w-16 rounded bg-sb-border" />
          <div className="mt-1 h-3 w-3/4 rounded bg-sb-border" />
        </div>
      ))}
    </div>
  );
}
