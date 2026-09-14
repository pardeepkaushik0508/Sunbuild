import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrintSoaPage({ params }: PageProps) {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
    Role.CLIENT,
  ]);
  const { id } = await params;

  const soa = await prisma.scheduleOfAllowances.findUnique({
    where: { id },
    include: {
      contract: true,
      buyer: true,
      project: true,
      items: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!soa) notFound();

  const buyerName = soa.buyer
    ? fullName(soa.buyer.firstName, soa.buyer.lastName)
    : fullName(soa.contract?.buyerFirstName, soa.contract?.buyerLastName) || "Client";
  const address =
    soa.contract?.municipalAddress || soa.project?.name || soa.contract?.projectName || "Site Address";

  // Group items by category
  const categories = Array.from(new Set(soa.items.map((i) => i.category))).sort();

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900 print:bg-white print:py-0">
      {/* Top Action Bar */}
      <div className="mx-auto max-w-4xl px-4 pb-6 print:hidden flex items-center justify-between">
        <Link
          href={`/sales/soa/${soa.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SOA Workspace
        </Link>
        <button
          onClick={() => {}}
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-neutral-800"
        >
          <Printer className="h-4 w-4" />
          <span>Print / Save to PDF</span>
        </button>
      </div>

      {/* Printable Sheet */}
      <div className="mx-auto max-w-4xl rounded-xl bg-white p-10 shadow-lg border border-neutral-200 print:border-none print:shadow-none print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 uppercase">
              Schedule of Allowances (SOA)
            </h1>
            <p className="text-sm text-neutral-600 font-medium mt-0.5">
              {soa.contract?.builderName || "Sunview Custom Homes Ltd."}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-neutral-900 text-sm">{soa.soaNumber}</p>
            <p className="text-neutral-500">Version: v{soa.version}</p>
            <p className="text-neutral-500">Contract: {soa.contract?.contractNumber || "PC"}</p>
            <p className="text-neutral-500">Status: {soa.status}</p>
            <p className="text-neutral-500">Date: {formatDate(soa.createdAt)}</p>
          </div>
        </div>

        {/* Client & Project */}
        <div className="grid grid-cols-2 gap-8 py-6 border-b border-neutral-200 text-xs">
          <div>
            <h2 className="font-bold uppercase tracking-wider text-neutral-500 mb-1">
              Client / Buyer
            </h2>
            <p className="font-bold text-neutral-900 text-sm">{buyerName}</p>
            {soa.buyer?.email ? <p className="text-neutral-600">{soa.buyer.email}</p> : null}
            {soa.buyer?.phone ? <p className="text-neutral-600">{soa.buyer.phone}</p> : null}
          </div>
          <div>
            <h2 className="font-bold uppercase tracking-wider text-neutral-500 mb-1">
              Project / Property
            </h2>
            <p className="font-bold text-neutral-900 text-sm">{address}</p>
            {soa.contract?.lotBlockPlan ? (
              <p className="text-neutral-600">Lot/Block: {soa.contract.lotBlockPlan}</p>
            ) : null}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-3 gap-4 py-6 border-b border-neutral-200 text-center text-xs">
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
              Total Budgeted Allowance
            </span>
            <span className="text-lg font-bold font-mono text-neutral-900 mt-1 block">
              {formatCurrency(soa.totalAllowance)}
            </span>
          </div>
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
              Committed to Selections
            </span>
            <span className="text-lg font-bold font-mono text-neutral-900 mt-1 block">
              {formatCurrency(soa.committedAmount)}
            </span>
          </div>
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <span className="text-neutral-500 block uppercase tracking-wider text-[10px] font-bold">
              Remaining Allowance
            </span>
            <span className="text-lg font-bold font-mono text-neutral-900 mt-1 block">
              {formatCurrency(soa.remainingAmount)}
            </span>
          </div>
        </div>

        {/* Itemized Categories */}
        <div className="py-6 space-y-6 text-xs">
          {categories.map((cat) => {
            const catItems = soa.items.filter((i) => i.category === cat);
            const catTotal = catItems.reduce((s, i) => s + Number(i.amount), 0);
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center justify-between border-b border-neutral-300 pb-1">
                  <h3 className="font-bold text-neutral-900 uppercase tracking-wider">{cat}</h3>
                  <span className="font-mono font-bold text-neutral-900">
                    {formatCurrency(catTotal)}
                  </span>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-neutral-400 text-[10px] uppercase border-b border-neutral-100">
                      <th className="py-1">Item Name / Description</th>
                      <th className="py-1">Location</th>
                      <th className="py-1">Due Date</th>
                      <th className="py-1 text-right">Allowance Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {catItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 pr-4">
                          <p className="font-medium text-neutral-900">{item.name}</p>
                          {item.description ? (
                            <p className="text-[11px] text-neutral-500 mt-0.5">{item.description}</p>
                          ) : null}
                        </td>
                        <td className="py-2 text-neutral-600">{item.location || "—"}</td>
                        <td className="py-2 text-neutral-600">
                          {item.selectionDueDate ? formatDate(item.selectionDueDate) : "—"}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold text-neutral-900">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Notes & Acceptance */}
        <div className="pt-8 border-t border-neutral-200 text-xs text-neutral-500 space-y-2">
          <p>
            * Allowances are budgeted amounts established in the Purchase Agreement. If actual selections exceed the allowance, an overage will be submitted via Change Order. Unused allowance amounts are credited upon completion.
          </p>
        </div>
      </div>
    </div>
  );
}
