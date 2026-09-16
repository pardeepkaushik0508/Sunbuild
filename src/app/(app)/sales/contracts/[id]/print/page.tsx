import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireRole, assertContractAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

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

  const contract = await prisma.purchaseContract.findFirst({
    where: { id, companyId: session.membership.companyId },
    include: {
      scheduleOfAllowances: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      buyer: true,
      project: true,
    },
  });

  if (!contract) notFound();
  await assertContractAccess(session, contract.id);

  const buyerName = contract.buyer
    ? fullName(contract.buyer.firstName, contract.buyer.lastName)
    : fullName(contract.buyerFirstName, contract.buyerLastName) || "Client";
  const address = contract.municipalAddress || contract.projectName || "Site Address";
  const soa = contract.scheduleOfAllowances;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900 print:bg-white print:py-0">
      {/* Top Action Bar (Hidden when printing) */}
      <div className="mx-auto max-w-4xl px-4 pb-6 print:hidden flex items-center justify-between">
        <Link
          href={`/sales/contracts/${contract.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Contract Workspace
        </Link>
        <button
          onClick={() => {
            // Client script or button
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-neutral-800"
          // We can use an inline script or print utility
        >
          <Printer className="h-4 w-4" />
          <span onClick={() => {}}>Print / Save to PDF</span>
        </button>
      </div>

      {/* Printable Sheet */}
      <div className="mx-auto max-w-4xl rounded-xl bg-white p-10 shadow-lg border border-neutral-200 print:border-none print:shadow-none print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 uppercase">
              Purchase Contract & Agreement
            </h1>
            <p className="text-sm text-neutral-600 font-medium mt-0.5">
              {contract.builderName || "Sunview Custom Homes Ltd."}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-neutral-900 text-sm">
              {contract.contractNumber || "PC-DRAFT"}
            </p>
            <p className="text-neutral-500">Version: v{contract.version}</p>
            <p className="text-neutral-500">Status: {contract.status}</p>
            <p className="text-neutral-500">Date: {formatDate(contract.contractDate || contract.createdAt)}</p>
          </div>
        </div>

        {/* Parties & Property */}
        <div className="grid grid-cols-2 gap-8 py-6 border-b border-neutral-200 text-xs">
          <div>
            <h2 className="font-bold uppercase tracking-wider text-neutral-500 mb-2">
              Buyer / Purchaser
            </h2>
            <p className="font-bold text-neutral-900 text-sm">{buyerName}</p>
            {contract.buyerEmail ? <p className="text-neutral-600">{contract.buyerEmail}</p> : null}
            {contract.buyerPhone ? <p className="text-neutral-600">{contract.buyerPhone}</p> : null}
            {contract.buyerMailing ? (
              <p className="text-neutral-600 mt-1">{contract.buyerMailing}</p>
            ) : null}
          </div>
          <div>
            <h2 className="font-bold uppercase tracking-wider text-neutral-500 mb-2">
              Property & Build Site
            </h2>
            <p className="font-bold text-neutral-900 text-sm">{address}</p>
            {contract.legalAddress ? (
              <p className="text-neutral-600 mt-0.5">Legal: {contract.legalAddress}</p>
            ) : null}
            {contract.lotBlockPlan ? (
              <p className="text-neutral-600">Lot/Block: {contract.lotBlockPlan}</p>
            ) : null}
            {contract.targetClosing ? (
              <p className="text-neutral-600 mt-1">
                Target Closing: {formatDate(contract.targetClosing)}
              </p>
            ) : null}
          </div>
        </div>

        {/* Authoritative Financial Breakdown */}
        <div className="py-6 border-b border-neutral-200">
          <h2 className="font-bold uppercase tracking-wider text-neutral-500 text-xs mb-3">
            Financial Structure & Price Summary (CAD)
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500 text-left">
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
                  {formatCurrency(contract.allowanceTotal ?? soa?.totalAllowance ?? 0)}
                </td>
              </tr>
              {contract.upgradesTotal ? (
                <tr>
                  <td className="py-2.5 font-medium text-neutral-900">Agreed Pre-Contract Upgrades</td>
                  <td className="py-2.5 text-right font-mono">
                    {formatCurrency(contract.upgradesTotal)}
                  </td>
                </tr>
              ) : null}
              {contract.discountsTotal ? (
                <tr>
                  <td className="py-2.5 font-medium text-neutral-900">Promotional Discounts / Credits</td>
                  <td className="py-2.5 text-right font-mono text-emerald-700">
                    -{formatCurrency(contract.discountsTotal)}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td className="py-2.5 font-medium text-neutral-900">GST ({contract.taxRate ?? 5.0}%)</td>
                <td className="py-2.5 text-right font-mono text-neutral-600">
                  {formatCurrency(contract.taxAmount ?? 0)}
                </td>
              </tr>
              <tr className="border-t-2 border-neutral-900 font-bold text-sm">
                <td className="py-3 text-neutral-950">TOTAL PURCHASE CONTRACT PRICE</td>
                <td className="py-3 text-right font-mono text-neutral-950">
                  {formatCurrency(contract.totalContractPrice ?? contract.purchasePrice ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Scope, Inclusions, and Terms */}
        <div className="py-6 space-y-4 text-xs border-b border-neutral-200">
          {contract.scopeSummary ? (
            <div>
              <h3 className="font-bold text-neutral-900 mb-1">Scope of Work</h3>
              <p className="text-neutral-700 whitespace-pre-line leading-relaxed">
                {contract.scopeSummary}
              </p>
            </div>
          ) : null}

          {contract.inclusions ? (
            <div>
              <h3 className="font-bold text-neutral-900 mb-1">Inclusions</h3>
              <p className="text-neutral-700 whitespace-pre-line leading-relaxed">
                {contract.inclusions}
              </p>
            </div>
          ) : null}

          {contract.exclusions ? (
            <div>
              <h3 className="font-bold text-neutral-900 mb-1">Exclusions</h3>
              <p className="text-neutral-700 whitespace-pre-line leading-relaxed">
                {contract.exclusions}
              </p>
            </div>
          ) : null}

          {contract.specialConditions ? (
            <div>
              <h3 className="font-bold text-neutral-900 mb-1">Special Conditions</h3>
              <p className="text-neutral-700 whitespace-pre-line leading-relaxed">
                {contract.specialConditions}
              </p>
            </div>
          ) : null}
        </div>

        {/* Allowance Schedule Summary */}
        {soa && soa.items.length > 0 ? (
          <div className="py-6 border-b border-neutral-200 text-xs">
            <h2 className="font-bold uppercase tracking-wider text-neutral-500 mb-3">
              Included Schedule of Allowances (SOA: {soa.soaNumber})
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {soa.items.map((item) => (
                <div key={item.id} className="flex justify-between border-b border-neutral-100 py-1.5">
                  <span className="text-neutral-800 font-medium">
                    {item.name} ({item.category})
                  </span>
                  <span className="font-mono text-neutral-900 font-semibold">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Signatures & Acceptance Block */}
        <div className="pt-8 text-xs">
          <p className="text-neutral-600 mb-8 italic">
            IN WITNESS WHEREOF, the parties hereto have executed this Purchase Agreement as of the date first written above.
          </p>

          <div className="grid grid-cols-2 gap-12 pt-4">
            <div>
              <div className="border-b border-neutral-400 pb-1 mb-2">
                <span className="text-[10px] text-neutral-400 block">Buyer Signature</span>
              </div>
              <p className="font-bold text-neutral-900">{buyerName}</p>
              <p className="text-neutral-500 text-[11px] mt-1">Date: ________________________</p>
            </div>

            <div>
              <div className="border-b border-neutral-400 pb-1 mb-2">
                <span className="text-[10px] text-neutral-400 block">Builder Authorized Representative</span>
              </div>
              <p className="font-bold text-neutral-900">
                {contract.builderName || "Sunview Custom Homes Ltd."}
              </p>
              <p className="text-neutral-500 text-[11px] mt-1">Date: ________________________</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
