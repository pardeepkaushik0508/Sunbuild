import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Role,
  StatementOfAdjustmentsStatus,
} from "@prisma/client";
import { PageHeader, Card, MetricCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import {
  requireRole,
  getAccessibleProjectIds,
} from "@/lib/session";
import { roleHasCapability } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { loadStatementOfAdjustmentsForProject } from "@/lib/statement-of-adjustments/load";
import {
  finalizeStatementOfAdjustmentsAction,
  updateSoaPromoCreditAction,
} from "@/lib/statement-of-adjustments/actions";
import { formatSoaCurrency } from "@/lib/statement-of-adjustments/money";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statementId?: string }>;
};

export default async function ProjectStatementOfAdjustmentsPage({
  params,
  searchParams,
}: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
    Role.BOOKKEEPER,
    Role.SALES_MANAGER,
  ]);
  const { id: projectId } = await params;
  const { statementId } = await searchParams;

  const accessible = await getAccessibleProjectIds(session);
  if (!accessible.includes(projectId)) notFound();

  const loaded = await loadStatementOfAdjustmentsForProject({
    projectId,
    companyId: session.membership.companyId,
    ensureDraft: true,
    userId: session.user.id,
    statementId: statementId || undefined,
  });

  const versions = await prisma.statementOfAdjustments.findMany({
    where: { projectId, companyId: session.membership.companyId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      status: true,
      statementNumber: true,
      statementDate: true,
      finalizedAt: true,
    },
  });

  const canManage = roleHasCapability(
    session.membership.role,
    "manageStatementOfAdjustments",
    session.membership.permissionMatrix
  );
  const record = loaded.record;
  const calc = loaded.calculations;
  const isDraft = record?.status === StatementOfAdjustmentsStatus.DRAFT;
  const pdfHref = record
    ? `/api/statement-of-adjustments/${record.id}/pdf`
    : `/api/statement-of-adjustments/${projectId}/pdf`;
  const previewHref = `${pdfHref}?preview=1`;

  return (
    <div className="w-full space-y-5 pb-10">
      <PageHeader
        title="Statement of Adjustments"
        description={`${loaded.projectName} · Closing settlement (not Schedule of Allowances)`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/pm/projects/${projectId}`}>
              <Button variant="outline" size="sm">
                Back to project
              </Button>
            </Link>
            {loaded.canGeneratePdf ? (
              <>
                <a href={previewHref} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    Preview PDF
                  </Button>
                </a>
                <a href={pdfHref}>
                  <Button size="sm">Download SOA</Button>
                </a>
              </>
            ) : (
              <Button size="sm" disabled>
                Download SOA
              </Button>
            )}
          </div>
        }
      />

      {!loaded.canGeneratePdf ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            Complete required data before generating the PDF
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
            {loaded.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Total sales price"
          value={formatCurrency(calc.totalSalesPrice)}
          accent="blue"
        />
        <MetricCard
          label="Deposits to date"
          value={formatSoaCurrency(calc.depositsToDate, { asCredit: true })}
          accent="orange"
        />
        <MetricCard
          label="Cash to close"
          value={formatCurrency(calc.cashToClose)}
          accent="green"
        />
        <MetricCard
          label="Status"
          value={record?.status ?? "DRAFT"}
          accent="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-sb-ink">
                Financial summary
              </h2>
              <p className="text-xs text-sb-muted">
                Live from Purchase Contract, approved Change Orders &amp;
                received deposits
                {record ? ` · ${record.statementNumber}` : ""}
              </p>
            </div>
            {record ? (
              <StatusBadge tone={statusTone(record.status)}>
                {record.status}
              </StatusBadge>
            ) : null}
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-sb-muted">Municipal Address</dt>
              <dd className="font-medium">
                {loaded.party.municipalAddress || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sb-muted">Contract #</dt>
              <dd className="font-medium">
                {loaded.party.contractNumber || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sb-muted">Buyer</dt>
              <dd className="font-medium">{loaded.party.buyerName || "—"}</dd>
            </div>
            <div>
              <dt className="text-sb-muted">Possession</dt>
              <dd className="font-medium">
                {formatDate(loaded.party.possessionDate)}
              </dd>
            </div>
          </dl>

          <div className="overflow-x-auto rounded-[12px] border border-sb-border">
            <table className="w-full text-sm">
              <tbody>
                <SoaRow
                  label="Base Home Price (Including Lot Cost)"
                  value={formatCurrency(calc.baseHomePrice)}
                />
                <SoaRow
                  label="Subtotal"
                  value={formatCurrency(calc.subtotal)}
                  bold
                />
                <tr className="bg-sb-canvas/60">
                  <td
                    colSpan={2}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sb-muted"
                  >
                    Approved Change Orders
                  </td>
                </tr>
                {calc.changeOrders.length === 0 ? (
                  <SoaRow label="None" value={formatCurrency(0)} muted />
                ) : (
                  calc.changeOrders.map((co) => (
                    <SoaRow
                      key={co.id}
                      label={co.label}
                      value={formatCurrency(co.amount)}
                      indent
                    />
                  ))
                )}
                <SoaRow
                  label="Change Orders Subtotal"
                  value={formatCurrency(calc.changeOrdersSubtotal)}
                  bold
                />
                <SoaRow
                  label="Allowance (Promo credit)"
                  value={formatSoaCurrency(calc.promoCreditAdjustment, {
                    asCredit: true,
                  })}
                />
                <SoaRow
                  label="Change Orders Total (Without GST)"
                  value={formatCurrency(calc.changeOrdersTotalWithoutGst)}
                  bold
                />
                <SoaRow
                  label="TOTAL CLOSING PRICE"
                  value={formatCurrency(calc.totalClosingPrice)}
                  bold
                />
                <SoaRow
                  label={`GST ${calc.gstRatePercent}%`}
                  value={formatCurrency(calc.totalGst)}
                />
                <SoaRow
                  label="TOTAL SALES PRICE"
                  value={formatCurrency(calc.totalSalesPrice)}
                  bold
                />
                <tr className="bg-sb-canvas/60">
                  <td
                    colSpan={2}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sb-muted"
                  >
                    Deposits (received)
                  </td>
                </tr>
                {calc.deposits.length === 0 ? (
                  <SoaRow label="None" value={formatCurrency(0)} muted />
                ) : (
                  calc.deposits.map((d) => (
                    <SoaRow
                      key={d.id}
                      label={d.label}
                      value={formatCurrency(d.amount)}
                      indent
                    />
                  ))
                )}
                <SoaRow
                  label="Deposits to Date to Sunview"
                  value={formatSoaCurrency(calc.depositsToDate, {
                    asCredit: true,
                  })}
                  bold
                />
                <tr className="bg-sb-ink text-white">
                  <td className="px-3 py-3 font-bold">
                    CASH TO CLOSE (Balance as of today)
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">
                    {formatCurrency(calc.cashToClose)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold">Promo credit</h3>
            <p className="text-xs text-sb-muted">
              Allowance / promo credit toward approved Change Orders. PM can
              download; Owner/Bookkeeper can edit.
            </p>
            {canManage && record && isDraft ? (
              <ActionForm action={updateSoaPromoCreditAction}>
                <input type="hidden" name="statementId" value={record.id} />
                <FormField label="Promo credit ($)">
                  <Input
                    name="promoCreditAdjustment"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={record.promoCreditAdjustment}
                  />
                </FormField>
                <SubmitButton className="mt-2 w-full">
                  Update credit
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-lg font-bold tabular-nums">
                {formatSoaCurrency(calc.promoCreditAdjustment, {
                  asCredit: true,
                })}
              </p>
            )}
          </Card>

          {canManage && record && isDraft ? (
            <Card className="space-y-3">
              <h3 className="text-sm font-semibold">Finalize</h3>
              <p className="text-xs text-sb-muted">
                Locks a financial snapshot and stores the PDF in Cloudinary.
                Creates a new draft version for later revisions.
              </p>
              <ActionForm action={finalizeStatementOfAdjustmentsAction}>
                <input type="hidden" name="statementId" value={record.id} />
                <SubmitButton
                  className="w-full"
                  disabled={!loaded.canGeneratePdf}
                >
                  Finalize statement
                </SubmitButton>
              </ActionForm>
            </Card>
          ) : null}

          <Card className="space-y-3">
            <h3 className="text-sm font-semibold">Versions</h3>
            <ul className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/pm/projects/${projectId}/statement-of-adjustments?statementId=${v.id}`}
                    className="flex items-center justify-between gap-2 rounded-[10px] border border-sb-border px-3 py-2 hover:border-sb-orange/40"
                  >
                    <span>
                      v{v.version} · {v.statementNumber}
                    </span>
                    <StatusBadge tone={statusTone(v.status)}>
                      {v.status}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SoaRow({
  label,
  value,
  bold,
  indent,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className="border-t border-sb-border/70">
      <td
        className={`px-3 py-2 ${indent ? "pl-6" : ""} ${bold ? "font-semibold" : ""} ${muted ? "text-sb-muted" : ""}`}
      >
        {label}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${bold ? "font-semibold" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}
