import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireRole, assertContractAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { PrintPageButton } from "@/components/ui/print-page-button";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrintContractPage({ params }: PageProps) {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
    Role.CLIENT,
  ]);
  const { id } = await params;
  const companyId = session.membership.companyId;

  // Do not require companyId on the row — legacy/confirmed contracts may be null.
  // Tenant is enforced below + assertContractAccess.
  const contract = await prisma.purchaseContract.findFirst({
    where: {
      OR: [{ id }, { contractNumber: id }],
    },
    include: {
      scheduleOfAllowances: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      buyer: true,
      project: { select: { id: true, companyId: true, name: true } },
    },
  });

  if (!contract) notFound();

  const tenantId = contract.companyId ?? contract.project?.companyId ?? null;
  if (tenantId && tenantId !== companyId) notFound();
  if (contract.companyId && contract.companyId !== companyId) notFound();

  try {
    await assertContractAccess(session, contract.id);
  } catch {
    notFound();
  }

  const buyerName = contract.buyer
    ? fullName(contract.buyer.firstName, contract.buyer.lastName)
    : fullName(contract.buyerFirstName, contract.buyerLastName) || "Client";
  const address =
    contract.municipalAddress ||
    contract.project?.name ||
    contract.projectName ||
    "Site Address";
  const soa = contract.scheduleOfAllowances;
  const backHref =
    session.membership.role === Role.CLIENT
      ? "/client/documents"
      : `/sales/contracts/${contract.id}`;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900 print:bg-white print:py-0">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 pb-6 print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <PrintPageButton />
      </div>

      <div className="mx-auto max-w-4xl rounded-xl border border-neutral-200 bg-white p-10 shadow-lg print:max-w-none print:border-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 uppercase">
              Purchase Contract & Agreement
            </h1>
            <p className="mt-0.5 text-sm font-medium text-neutral-600">
              {contract.builderName || "Sunview Custom Homes Ltd."}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="text-sm font-bold text-neutral-900">
              {contract.contractNumber || "PC-DRAFT"}
            </p>
            <p className="text-neutral-500">Version: v{contract.version}</p>
            <p className="text-neutral-500">Status: {contract.status}</p>
            <p className="text-neutral-500">
              Date: {formatDate(contract.contractDate || contract.createdAt)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 border-b border-neutral-200 py-6 text-xs">
          <div>
            <h2 className="mb-2 font-bold tracking-wider text-neutral-500 uppercase">
              Buyer / Purchaser
            </h2>
            <p className="text-sm font-bold text-neutral-900">{buyerName}</p>
            {contract.buyerEmail ? (
              <p className="text-neutral-600">{contract.buyerEmail}</p>
            ) : null}
            {contract.buyerPhone ? (
              <p className="text-neutral-600">{contract.buyerPhone}</p>
            ) : null}
            {contract.buyerMailing ? (
              <p className="mt-1 text-neutral-600">{contract.buyerMailing}</p>
            ) : null}
          </div>
          <div>
            <h2 className="mb-2 font-bold tracking-wider text-neutral-500 uppercase">
              Property & Build Site
            </h2>
            <p className="text-sm font-bold text-neutral-900">{address}</p>
            {contract.legalAddress ? (
              <p className="mt-0.5 text-neutral-600">
                Legal: {contract.legalAddress}
              </p>
            ) : null}
            {contract.lotBlockPlan ? (
              <p className="text-neutral-600">
                Lot/Block: {contract.lotBlockPlan}
              </p>
            ) : null}
            {contract.targetClosing ? (
              <p className="mt-1 text-neutral-600">
                Target Closing: {formatDate(contract.targetClosing)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="border-b border-neutral-200 py-6">
          <h2 className="mb-3 text-xs font-bold tracking-wider text-neutral-500 uppercase">
            Financial Structure & Price Summary (CAD)
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2">Item Description</th>
                <th className="py-2 text-right">Amount (CAD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              <tr>
                <td className="py-2.5 font-medium text-neutral-900">
                  Base Construction & Structure
                </td>
                <td className="py-2.5 text-right font-mono">
                  {formatCurrency(contract.basePrice ?? 0)}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-neutral-900">
                  Schedule of Allowances (SOA Budget)
                </td>
                <td className="py-2.5 text-right font-mono">
                  {formatCurrency(
                    contract.allowanceTotal ?? soa?.totalAllowance ?? 0
                  )}
                </td>
              </tr>
              {contract.upgradesTotal ? (
                <tr>
                  <td className="py-2.5 font-medium text-neutral-900">
                    Agreed Pre-Contract Upgrades
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {formatCurrency(contract.upgradesTotal)}
                  </td>
                </tr>
              ) : null}
              {contract.discountsTotal ? (
                <tr>
                  <td className="py-2.5 font-medium text-neutral-900">
                    Promotional Discounts / Credits
                  </td>
                  <td className="py-2.5 text-right font-mono text-emerald-700">
                    -{formatCurrency(contract.discountsTotal)}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td className="py-2.5 font-medium text-neutral-900">
                  GST ({contract.taxRate ?? 5.0}%)
                </td>
                <td className="py-2.5 text-right font-mono text-neutral-600">
                  {formatCurrency(contract.taxAmount ?? 0)}
                </td>
              </tr>
              <tr className="border-t-2 border-neutral-900 text-sm font-bold">
                <td className="py-3 text-neutral-950">
                  TOTAL PURCHASE CONTRACT PRICE
                </td>
                <td className="py-3 text-right font-mono text-neutral-950">
                  {formatCurrency(
                    contract.totalContractPrice ?? contract.purchasePrice ?? 0
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-4 border-b border-neutral-200 py-6 text-xs">
          {contract.scopeSummary ? (
            <div>
              <h3 className="mb-1 font-bold text-neutral-900">Scope of Work</h3>
              <p className="leading-relaxed whitespace-pre-line text-neutral-700">
                {contract.scopeSummary}
              </p>
            </div>
          ) : null}
          {contract.inclusions ? (
            <div>
              <h3 className="mb-1 font-bold text-neutral-900">Inclusions</h3>
              <p className="leading-relaxed whitespace-pre-line text-neutral-700">
                {contract.inclusions}
              </p>
            </div>
          ) : null}
          {contract.exclusions ? (
            <div>
              <h3 className="mb-1 font-bold text-neutral-900">Exclusions</h3>
              <p className="leading-relaxed whitespace-pre-line text-neutral-700">
                {contract.exclusions}
              </p>
            </div>
          ) : null}
          {contract.specialConditions ? (
            <div>
              <h3 className="mb-1 font-bold text-neutral-900">
                Special Conditions
              </h3>
              <p className="leading-relaxed whitespace-pre-line text-neutral-700">
                {contract.specialConditions}
              </p>
            </div>
          ) : null}
        </div>

        {soa && soa.items.length > 0 ? (
          <div className="border-b border-neutral-200 py-6 text-xs">
            <h2 className="mb-3 font-bold tracking-wider text-neutral-500 uppercase">
              Included Schedule of Allowances (SOA: {soa.soaNumber})
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {soa.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between border-b border-neutral-100 py-1.5"
                >
                  <span className="font-medium text-neutral-800">
                    {item.name} ({item.category})
                  </span>
                  <span className="font-mono font-semibold text-neutral-900">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="pt-8 text-xs">
          <p className="mb-8 text-neutral-600 italic">
            IN WITNESS WHEREOF, the parties hereto have executed this Purchase
            Agreement as of the date first written above.
          </p>
          <div className="grid grid-cols-2 gap-12 pt-4">
            <div>
              <div className="mb-2 border-b border-neutral-400 pb-1">
                <span className="block text-[10px] text-neutral-400">
                  Buyer Signature
                </span>
              </div>
              <p className="font-bold text-neutral-900">{buyerName}</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                Date: ________________________
              </p>
            </div>
            <div>
              <div className="mb-2 border-b border-neutral-400 pb-1">
                <span className="block text-[10px] text-neutral-400">
                  Builder Authorized Representative
                </span>
              </div>
              <p className="font-bold text-neutral-900">
                {contract.builderName || "Sunview Custom Homes Ltd."}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                Date: ________________________
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
