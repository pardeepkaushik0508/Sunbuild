"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export type ClientScheduleCardData = {
  id: string;
  kind: "schedule" | "milestone";
  title: string;
  description: string | null;
  dateLabel: string;
  statusLabel: string;
  statusRaw: string;
  contractor: string | null;
  duration: string;
  startDate: string | null;
  endDate: string | null;
  messagePmHref: string | null;
};

export function ClientScheduleBoard({
  items,
}: {
  items: ClientScheduleCardData[];
}) {
  const [detail, setDetail] = useState<ClientScheduleCardData | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No upcoming schedule"
        description="Your build timeline will appear here once the team publishes it."
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <Card key={`${item.kind}-${item.id}`} className="flex flex-col">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-sb-ink">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-sb-muted">
                  {item.description ||
                    (item.kind === "milestone"
                      ? "Project milestone"
                      : "Scheduled work")}
                </p>
              </div>
              <StatusBadge tone={statusTone(item.statusRaw)}>
                {item.statusLabel}
              </StatusBadge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-sb-muted">Date</dt>
                <dd className="font-medium">{item.dateLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-sb-muted">Duration</dt>
                <dd className="font-medium">{item.duration}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-sb-muted">Contractor</dt>
                <dd className="font-medium">{item.contractor || "—"}</dd>
              </div>
            </dl>

            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDetail(item)}
              >
                View Details
              </Button>
              {item.messagePmHref ? (
                <a
                  href={item.messagePmHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button type="button" size="sm" variant="secondary">
                    <MessageCircle size={14} />
                    Message PM
                  </Button>
                </a>
              ) : (
                <Button type="button" size="sm" variant="secondary" disabled>
                  Message PM
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {detail ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-detail-title"
          onClick={() => setDetail(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDetail(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sb-border bg-sb-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="schedule-detail-title"
                  className="text-lg font-semibold text-sb-ink"
                >
                  {detail.title}
                </h2>
                <p className="text-sm text-sb-muted capitalize">{detail.kind}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-sb-muted hover:bg-sb-canvas"
                aria-label="Close"
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-sb-muted">
              {detail.description || "No additional client-facing notes."}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-sb-muted">Status</dt>
                <dd className="font-medium">{detail.statusLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sb-muted">Date</dt>
                <dd className="font-medium">{detail.dateLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sb-muted">Start</dt>
                <dd className="font-medium">
                  {formatDate(detail.startDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sb-muted">End</dt>
                <dd className="font-medium">{formatDate(detail.endDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sb-muted">Duration</dt>
                <dd className="font-medium">{detail.duration}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sb-muted">Contractor</dt>
                <dd className="font-medium">{detail.contractor || "—"}</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
