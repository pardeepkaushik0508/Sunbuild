import { InvoiceStatus } from "@prisma/client";
import {
  verifyInvoicePaidAction,
} from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireSession } from "@/lib/session";
import { requireFinanceAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function BookkeeperPaymentsQueuePage() {
  const session = await requireSession();
  requireFinanceAccess(session);

  const invoices = await prisma.invoice.findMany({
    where: {
      status: InvoiceStatus.PAYMENT_REPORTED,
      project: { companyId: session.membership.companyId },
    },
    include: {
      project: {
        select: {
          name: true,
          buyer: { select: { firstName: true, lastName: true } },
        },
      },
      reportedBy: { select: { name: true } },
    },
    orderBy: { reportedPaidAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Payments awaiting verification"
        description="Clients reported an external payment. Confirm before marking paid."
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="No payments awaiting verification"
          description="When a client taps “I have paid”, invoices appear here."
        />
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => (
            <Card key={inv.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">Invoice {inv.invoiceNumber}</h3>
                  <p className="mt-1 text-sm text-sb-muted">
                    {inv.project.name}
                    {inv.project.buyer
                      ? ` · ${inv.project.buyer.firstName} ${inv.project.buyer.lastName}`
                      : ""}
                  </p>
                </div>
                <StatusBadge tone={statusTone(inv.status)}>
                  Awaiting verification
                </StatusBadge>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-sb-muted">Amount</dt>
                  <dd>{formatCurrency(inv.amount)}</dd>
                </div>
                <div>
                  <dt className="text-sb-muted">Client reported</dt>
                  <dd>{formatDate(inv.reportedPaidAt)}</dd>
                </div>
                <div>
                  <dt className="text-sb-muted">Reported by</dt>
                  <dd>{inv.reportedBy?.name ?? "Client"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionForm
                  action={verifyInvoicePaidAction.bind(null, inv.id, "PAID")}
                  successMessage="Payment verified"
                >
                  <SubmitButton size="sm" pendingLabel="Saving…">
                    Mark paid
                  </SubmitButton>
                </ActionForm>
                <ActionForm
                  action={verifyInvoicePaidAction.bind(
                    null,
                    inv.id,
                    "NEEDS_REVIEW"
                  )}
                  successMessage="Returned for review"
                >
                  <SubmitButton
                    size="sm"
                    variant="outline"
                    pendingLabel="Saving…"
                  >
                    Needs review
                  </SubmitButton>
                </ActionForm>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
