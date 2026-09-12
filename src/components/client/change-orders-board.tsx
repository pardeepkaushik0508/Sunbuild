"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, X } from "lucide-react";
import { ChangeOrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { FormField, Textarea } from "@/components/ui/form";
import { useOptionalToast } from "@/components/ui/toast";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { clientChangeOrderDecisionAction } from "@/lib/client/actions";
import type { ClientCoCardData } from "@/components/client/payments-board";
import { toSafeErrorMessage } from "@/lib/errors";

type FilterTab = "pending" | "approved" | "denied" | "all";

export function ClientChangeOrdersBoard({
  changeOrders,
}: {
  changeOrders: ClientCoCardData[];
}) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [tab, setTab] = useState<FilterTab>("pending");
  const [coDetail, setCoDetail] = useState<ClientCoCardData | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    let pendingCount = 0;
    let approvedCount = 0;
    let deniedCount = 0;
    for (const co of changeOrders) {
      if (co.status === ChangeOrderStatus.PENDING_CLIENT) pendingCount += 1;
      else if (co.status === ChangeOrderStatus.APPROVED) approvedCount += 1;
      else if (co.status === ChangeOrderStatus.REJECTED) deniedCount += 1;
    }
    return {
      pending: pendingCount,
      approved: approvedCount,
      denied: deniedCount,
      all: changeOrders.length,
    };
  }, [changeOrders]);

  const filtered = useMemo(() => {
    if (tab === "pending") {
      return changeOrders.filter(
        (co) => co.status === ChangeOrderStatus.PENDING_CLIENT
      );
    }
    if (tab === "approved") {
      return changeOrders.filter(
        (co) => co.status === ChangeOrderStatus.APPROVED
      );
    }
    if (tab === "denied") {
      return changeOrders.filter(
        (co) => co.status === ChangeOrderStatus.REJECTED
      );
    }
    return changeOrders;
  }, [changeOrders, tab]);

  function decide(
    id: string,
    decision: "APPROVED" | "REJECTED",
    form: FormData
  ) {
    setError(null);
    startTransition(async () => {
      try {
        await clientChangeOrderDecisionAction(id, decision, form);
        setCoDetail(null);
        toast?.success(
          decision === "APPROVED"
            ? "Change order approved"
            : "Change order rejected"
        );
        router.refresh();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Could not update change order";
        setError(message);
        toast?.error(toSafeErrorMessage(e));
      }
    });
  }

  const tabs: Array<{ key: FilterTab; label: string }> = [
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "approved", label: `Approved (${counts.approved})` },
    { key: "denied", label: `Denied (${counts.denied})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div
        className="flex flex-wrap gap-2 border-b border-sb-border pb-3"
        role="tablist"
        aria-label="Change order status"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === t.key
                ? "bg-[#1f2937] text-white"
                : "bg-sb-canvas text-sb-muted hover:text-sb-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            tab === "pending"
              ? "No pending change orders"
              : tab === "approved"
                ? "No approved change orders"
                : tab === "denied"
                  ? "No denied change orders"
                  : "No change orders"
          }
          description={
            tab === "pending"
              ? "When your project manager submits a change order, you can approve or deny it here."
              : "Decided change orders will appear in Approved or Denied."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((co) => (
            <Card key={co.id} className="flex flex-col">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-sb-ink">
                  {co.title}
                </h3>
                <StatusBadge tone={statusTone(co.status)}>
                  {co.status === ChangeOrderStatus.REJECTED
                    ? "DENIED"
                    : co.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-sb-muted">
                {co.description || "Change order"}
              </p>
              {co.clientComment ? (
                <p className="mt-2 rounded-lg bg-sb-canvas px-3 py-2 text-xs text-sb-muted">
                  Your note: {co.clientComment}
                </p>
              ) : null}
              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-lg font-semibold text-sb-ink">
                  {formatCurrency(co.amount)}
                </p>
                {co.scheduleImpact ? (
                  <span className="text-xs font-medium text-sb-orange">
                    +{co.scheduleImpact} days impact
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-sb-muted">
                {co.phase ? `${co.phase} · ` : ""}
                {co.status === ChangeOrderStatus.PENDING_CLIENT
                  ? "Awaiting your decision"
                  : co.actionDate
                    ? `Decided ${formatDate(co.actionDate)}`
                    : "—"}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {co.canDecide ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setCoDetail(co)}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCoDetail(co)}
                    >
                      Deny
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCoDetail(co)}
                  >
                    View details
                  </Button>
                )}
                {co.attachmentPath ? (
                  <a
                    href={`/api/files/${co.attachmentPath}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button type="button" size="sm" variant="outline">
                      <Download size={14} />
                      Download PDF
                    </Button>
                  </a>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {coDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setCoDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sb-border bg-sb-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-sb-ink">
                  {coDetail.title}
                </h2>
                <StatusBadge
                  tone={statusTone(coDetail.status)}
                  className="mt-2"
                >
                  {coDetail.status === ChangeOrderStatus.REJECTED
                    ? "DENIED"
                    : coDetail.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-sb-muted hover:bg-sb-canvas"
                aria-label="Close"
                onClick={() => setCoDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-sb-muted">
              {coDetail.description || "Review this change order."}
            </p>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-lg font-semibold text-sb-ink">
                {formatCurrency(coDetail.amount)}
              </p>
              {coDetail.scheduleImpact ? (
                <span className="text-xs font-medium text-sb-orange">
                  +{coDetail.scheduleImpact} days schedule impact
                </span>
              ) : null}
            </div>
            {coDetail.phase ? (
              <p className="mt-1 text-xs text-sb-muted">Reason: {coDetail.phase}</p>
            ) : null}
            {coDetail.clientComment ? (
              <p className="mt-3 rounded-lg bg-sb-canvas px-3 py-2 text-sm">
                Your note: {coDetail.clientComment}
              </p>
            ) : null}

            {coDetail.canDecide ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-sb-muted">
                  Approving records your authenticated acceptance with a
                  timestamp. Denying requires a short reason.
                </p>
                <form
                  action={(fd) => decide(coDetail.id, "APPROVED", fd)}
                  className="space-y-3"
                >
                  <FormField label="Comment (optional)">
                    <Textarea name="comment" />
                  </FormField>
                  <Button type="submit" disabled={pending}>
                    Approve change order
                  </Button>
                </form>
                <form
                  action={(fd) => decide(coDetail.id, "REJECTED", fd)}
                  className="space-y-3 border-t border-sb-border pt-4"
                >
                  <FormField label="Denial reason">
                    <Textarea name="comment" required />
                  </FormField>
                  <Button type="submit" variant="outline" disabled={pending}>
                    Deny change order
                  </Button>
                </form>
              </div>
            ) : (
              <div className="mt-4 flex justify-end">
                <Button type="button" onClick={() => setCoDetail(null)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
