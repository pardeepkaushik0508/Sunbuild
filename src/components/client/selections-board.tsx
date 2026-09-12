"use client";

import { useMemo, useState, useTransition } from "react";
import { Filter, MessageCircle } from "lucide-react";
import { SelectionSectionStatus, type Priority } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { ProgressBar, EmptyState, Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { dueBadgeLabel, type DueBadge } from "@/lib/client/due";
import { clientApproveSelectionSectionAction } from "@/lib/client/actions";
import { useOptionalToast } from "@/components/ui/toast";
import { toSafeErrorMessage } from "@/lib/errors";

export type ClientSelectionCardData = {
  id: string;
  name: string;
  description: string | null;
  priority: Priority;
  status: SelectionSectionStatus;
  dueDate: string | null;
  dueBadge: DueBadge;
  allowancePercent: number | null;
  selected: number;
  allowance: number | null;
  packageTitle: string;
  askQuestionHref: string | null;
  canApprove: boolean;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "due_soon", label: "Due soon" },
  { id: "high", label: "High priority" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function ClientSelectionsBoard({
  cards,
}: {
  cards: ClientSelectionCardData[];
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useOptionalToast();

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (filter === "all") return true;
      if (filter === "pending") {
        return (
          c.status === SelectionSectionStatus.DRAFT ||
          c.status === SelectionSectionStatus.CHANGES_REQUESTED
        );
      }
      if (filter === "submitted") {
        return c.status === SelectionSectionStatus.SUBMITTED;
      }
      if (filter === "approved") {
        return (
          c.status === SelectionSectionStatus.APPROVED ||
          c.status === SelectionSectionStatus.LOCKED
        );
      }
      if (filter === "due_soon") {
        return c.dueBadge === "DUE_SOON" || c.dueBadge === "DUE_NOW";
      }
      if (filter === "high") return c.priority === "HIGH";
      return true;
    });
  }, [cards, filter]);

  function onApprove(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await clientApproveSelectionSectionAction(id);
        toast?.success("Selection approved");
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Could not approve selection";
        setError(message);
        toast?.error(toSafeErrorMessage(e));
      }
    });
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No selections yet"
        description="Your project manager will open selection packages when they are ready for you."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sb-muted">
          {filtered.length} of {cards.length} categories
        </p>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            aria-haspopup="listbox"
          >
            <Filter size={14} />
            Filter
          </Button>
          {filterOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Close filter"
                onClick={() => setFilterOpen(false)}
              />
              <ul
                role="listbox"
                className="absolute right-0 z-20 mt-2 min-w-[180px] rounded-xl border border-sb-border bg-sb-surface p-1 shadow-lg"
              >
                {FILTERS.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={filter === f.id}
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-sb-canvas aria-selected:bg-sb-canvas aria-selected:font-semibold"
                      onClick={() => {
                        setFilter(f.id);
                        setFilterOpen(false);
                      }}
                    >
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching selections"
          description="Try a different filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((card) => {
            const dueLabel = dueBadgeLabel(card.dueBadge);
            const barPct = Math.min(100, card.allowancePercent ?? 0);
            return (
              <Card key={card.id} className="flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-sb-ink">
                      {card.name}
                    </h3>
                    <p className="text-xs text-sb-muted">{card.packageTitle}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge tone={statusTone(card.priority)}>
                      {card.priority}
                    </StatusBadge>
                    {dueLabel ? (
                      <StatusBadge
                        tone={
                          card.dueBadge === "OVERDUE" ||
                          card.dueBadge === "DUE_NOW"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {dueLabel}
                      </StatusBadge>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 line-clamp-3 text-sm text-sb-muted">
                  {card.description || "Review and confirm this selection category."}
                </p>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-sb-ink">Allowance used</span>
                    <span className="text-sb-muted">
                      {card.allowancePercent != null
                        ? `${card.allowancePercent}%`
                        : "—"}
                    </span>
                  </div>
                  {card.allowancePercent != null ? (
                    <ProgressBar
                      value={barPct}
                      color={
                        (card.allowancePercent ?? 0) > 100 ? "orange" : "blue"
                      }
                    />
                  ) : (
                    <div className="h-2 rounded-full bg-sb-canvas" />
                  )}
                  <p className="mt-1 text-xs text-sb-muted">
                    {formatCurrency(card.selected)}
                    {card.allowance != null
                      ? ` of ${formatCurrency(card.allowance)}`
                      : ""}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sb-muted">
                  <StatusBadge tone={statusTone(card.status)}>
                    {card.status.replace(/_/g, " ")}
                  </StatusBadge>
                  <span>Due {formatDate(card.dueDate)}</span>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {card.canApprove ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => onApprove(card.id)}
                    >
                      Approve
                    </Button>
                  ) : (
                    <Button type="button" size="sm" disabled>
                      {card.status === SelectionSectionStatus.LOCKED ||
                      card.status === SelectionSectionStatus.APPROVED
                        ? "Approved"
                        : "Submitted"}
                    </Button>
                  )}
                  {card.askQuestionHref ? (
                    <a
                      href={card.askQuestionHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button type="button" size="sm" variant="outline">
                        <MessageCircle size={14} />
                        Ask Question
                      </Button>
                    </a>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled>
                      Ask Question
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
