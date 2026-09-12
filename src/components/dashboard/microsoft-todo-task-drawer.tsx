"use client";

import { useId, useState, useTransition } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HighPriorityItem } from "@/components/dashboard/high-priority-widget";
import { cn } from "@/lib/utils";

function formatFullDue(due?: Date | string | null) {
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

export function MicrosoftTodoTaskDrawer({
  item,
  onClose,
  onCompleted,
}: {
  item: HighPriorityItem;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function complete() {
    if (!item.microsoftTaskId || !item.microsoftListId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/microsoft/todo/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            microsoftTaskId: item.microsoftTaskId,
            microsoftListId: item.microsoftListId,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error || "Unable to update Microsoft To Do task.");
          return;
        }
        onCompleted?.();
        onClose();
      } catch {
        setError("Unable to update Microsoft To Do task.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-sb-muted">
              Microsoft To Do
            </p>
            <h2
              id={titleId}
              className="mt-0.5 text-lg font-semibold text-sb-ink"
            >
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[12px] text-sb-muted">Description</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sb-ink">
              {item.description || "—"}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[12px] text-sb-muted">Due</dt>
              <dd
                className={cn(
                  "mt-0.5 font-medium",
                  item.isOverdue ? "text-rose-600" : "text-sb-ink"
                )}
              >
                {formatFullDue(item.dueDate)}
                {item.isOverdue ? " · Overdue" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-sb-muted">Importance</dt>
              <dd className="mt-0.5 font-medium text-sb-ink">{item.priority}</dd>
            </div>
          </div>
          <div>
            <dt className="text-[12px] text-sb-muted">Linked project</dt>
            <dd className="mt-0.5 text-sb-ink">
              {item.projectName ? (
                item.projectId ? (
                  <a
                    href={`/pm/projects/${item.projectId}`}
                    className="font-medium hover:underline"
                  >
                    {item.projectName}
                  </a>
                ) : (
                  item.projectName
                )
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-sb-muted">Source</dt>
            <dd className="mt-0.5 text-sb-ink">Microsoft To Do</dd>
          </div>
        </dl>

        {error ? (
          <p className="mt-3 text-[12px] text-sb-red">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {item.microsoftTaskId && item.microsoftListId ? (
            <Button
              variant="yellow"
              size="sm"
              disabled={pending}
              onClick={complete}
            >
              {pending ? "Completing…" : "Mark complete"}
            </Button>
          ) : null}
          {item.webLink ? (
            <a
              href={item.webLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sb-border px-3 py-1.5 text-[12px] font-medium text-sb-ink hover:bg-sb-canvas"
            >
              <ExternalLink size={14} />
              Open in Microsoft To Do
            </a>
          ) : (
            <a
              href="https://to-do.office.com/tasks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sb-border px-3 py-1.5 text-[12px] font-medium text-sb-ink hover:bg-sb-canvas"
            >
              <ExternalLink size={14} />
              Open in Microsoft To Do
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
