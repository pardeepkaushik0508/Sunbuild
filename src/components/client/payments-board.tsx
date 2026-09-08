"use client";

import { useState, useTransition } from "react";
import { Download, X } from "lucide-react";
import { ChangeOrderStatus, type InvoiceStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { FormField, Textarea } from "@/components/ui/form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { clientChangeOrderDecisionAction } from "@/lib/client/actions";

export type ClientInvoiceCardData = {
  id: string;
  invoiceNumber: string;
  title: string;
  description: string | null;
  amount: number;
  status: InvoiceStatus;
  paymentLabel: string;
  paymentTone: "success" | "warning" | "danger" | "default" | "info";
  phase: string | null;
  dueDate: string | null;
  issueDate: string | null;
  notes: string | null;
  filePath: string | null;
  fileName: string | null;
};

export type ClientCoCardData = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  status: ChangeOrderStatus;
  phase: string | null;
  actionDate: string | null;
  attachmentPath: string | null;
  canDecide: boolean;
};

export function ClientPaymentsBoard({
  invoices,
  changeOrders,
}: {
  invoices: ClientInvoiceCardData[];
  changeOrders: ClientCoCardData[];
}) {
  const [invoiceDetail, setInvoiceDetail] =
    useState<ClientInvoiceCardData | null>(null);
  const [payInfo, setPayInfo] = useState<ClientInvoiceCardData | null>(null);
  const [coDetail, setCoDetail] = useState<ClientCoCardData | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(id: string, decision: "APPROVED" | "REJECTED", form: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await clientChangeOrderDecisionAction(id, decision, form);
        setCoDetail(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not update change order"
        );
      }
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-ink">
          Invoices & payments
        </h2>
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Invoices uploaded by your bookkeeper will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {invoices.map((inv) => (
              <Card key={inv.id} className="flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-sb-ink">
                      {inv.title}
                    </h3>
                    <p className="text-xs text-sb-muted">{inv.invoiceNumber}</p>
                  </div>
                  <StatusBadge tone={inv.paymentTone}>
                    {inv.paymentLabel}
                  </StatusBadge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-sb-muted">
                  {inv.description || "Project invoice"}
                </p>
                <p className="mt-3 font-[family-name:var(--font-outfit)] text-xl font-semibold">
                  {formatCurrency(inv.amount)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-sb-muted">
                  <div>
                    <dt>Phase</dt>
                    <dd className="font-medium text-sb-ink">
                      {inv.phase || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd className="font-medium text-sb-ink">
                      {formatDate(inv.dueDate)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPayInfo(inv)}
                  >
                    Payment instructions
                  </Button>
                  {inv.filePath ? (
                    <a
                      href={`/api/files/${inv.filePath}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button type="button" size="sm" variant="outline">
                        <Download size={14} />
                        Download
                      </Button>
                    </a>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled>
                      Download
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setInvoiceDetail(inv)}
                  >
                    View Details
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-ink">
          Change Orders
        </h2>
        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {changeOrders.length === 0 ? (
          <EmptyState
            title="No change orders"
            description="Scope changes that need your review will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {changeOrders.map((co) => (
              <Card key={co.id} className="flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-sb-ink">
                    {co.title}
                  </h3>
                  <StatusBadge tone={statusTone(co.status)}>
                    {co.status.replace(/_/g, " ")}
                  </StatusBadge>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-sb-muted">
                  {co.description || "Change order"}
                </p>
                <p className="mt-3 text-lg font-semibold">
                  {formatCurrency(co.amount)}
                </p>
                <p className="mt-1 text-xs text-sb-muted">
                  {co.phase ? `${co.phase} · ` : ""}
                  {co.actionDate
                    ? `Action ${formatDate(co.actionDate)}`
                    : "Awaiting action"}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {co.canDecide ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setCoDetail(co)}
                      >
                        Approve (e-sign)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCoDetail(co)}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
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
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled>
                      Download PDF
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {payInfo ? (
        <ModalShell
          title="Payment instructions"
          onClose={() => setPayInfo(null)}
        >
          <p className="text-sm text-sb-muted">
            Online payments are not processed in SUNBUILD for this MVP. Payment
            is handled outside the portal using your invoice and the
            instructions from your builder/bookkeeper.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Invoice" value={payInfo.invoiceNumber} />
            <Row label="Amount" value={formatCurrency(payInfo.amount)} />
            <Row label="Due" value={formatDate(payInfo.dueDate)} />
            <Row label="Status" value={payInfo.paymentLabel} />
          </dl>
          {payInfo.notes ? (
            <p className="mt-3 rounded-lg bg-sb-canvas p-3 text-sm">
              {payInfo.notes}
            </p>
          ) : (
            <p className="mt-3 text-sm text-sb-muted">
              No external payment instructions were attached to this invoice.
              Contact your project manager or bookkeeper for how to pay.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {payInfo.filePath ? (
              <a
                href={`/api/files/${payInfo.filePath}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button type="button" size="sm" variant="outline">
                  Download invoice
                </Button>
              </a>
            ) : null}
            <Button type="button" onClick={() => setPayInfo(null)}>
              Close
            </Button>
          </div>
        </ModalShell>
      ) : null}

      {invoiceDetail ? (
        <ModalShell
          title="Invoice details"
          onClose={() => setInvoiceDetail(null)}
        >
          <dl className="space-y-2 text-sm">
            <Row label="Invoice #" value={invoiceDetail.invoiceNumber} />
            <Row label="Amount" value={formatCurrency(invoiceDetail.amount)} />
            <Row
              label="Issue date"
              value={formatDate(invoiceDetail.issueDate)}
            />
            <Row label="Due date" value={formatDate(invoiceDetail.dueDate)} />
            <Row label="Phase" value={invoiceDetail.phase || "—"} />
            <Row label="Status" value={invoiceDetail.paymentLabel} />
            <Row
              label="Document"
              value={invoiceDetail.fileName || "Not uploaded"}
            />
          </dl>
          {invoiceDetail.notes ? (
            <p className="mt-3 text-sm text-sb-muted">{invoiceDetail.notes}</p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => setInvoiceDetail(null)}>
              Close
            </Button>
          </div>
        </ModalShell>
      ) : null}

      {coDetail ? (
        <ModalShell
          title={coDetail.title}
          onClose={() => setCoDetail(null)}
        >
          <p className="text-sm text-sb-muted">
            {coDetail.description || "Review this change order."}
          </p>
          <p className="mt-3 text-lg font-semibold">
            {formatCurrency(coDetail.amount)}
          </p>
          <p className="mt-2 text-xs text-sb-muted">
            Electronic acceptance records your authenticated user, confirmation,
            and timestamp. This is not a third-party certified e-signature
            service.
          </p>
          {coDetail.canDecide ? (
            <div className="mt-4 space-y-4">
              <form
                action={(fd) => decide(coDetail.id, "APPROVED", fd)}
                className="space-y-3"
              >
                <FormField label="Comment (optional)">
                  <Textarea name="comment" />
                </FormField>
                <Button type="submit" disabled={pending}>
                  Approve (e-sign)
                </Button>
              </form>
              <form
                action={(fd) => decide(coDetail.id, "REJECTED", fd)}
                className="space-y-3 border-t border-sb-border pt-4"
              >
                <FormField label="Rejection reason">
                  <Textarea name="comment" required />
                </FormField>
                <Button type="submit" variant="outline" disabled={pending}>
                  Reject
                </Button>
              </form>
            </div>
          ) : (
            <p className="mt-4 text-sm text-sb-muted">
              This change order is{" "}
              {coDetail.status.replace(/_/g, " ").toLowerCase()} and can no
              longer be decided.
            </p>
          )}
        </ModalShell>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sb-muted">{label}</dt>
      <dd className="text-right font-medium text-sb-ink">{value}</dd>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sb-border bg-sb-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-sb-ink">{title}</h2>
          <button
            type="button"
            className="rounded-lg p-1 text-sb-muted hover:bg-sb-canvas"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
