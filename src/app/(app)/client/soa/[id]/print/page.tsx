import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireRole, assertProjectAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { PrintPageButton } from "@/components/ui/print-page-button";

export default async function ClientSoaPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(Role.CLIENT);
  const { id } = await params;

  const soa = await prisma.scheduleOfAllowances.findFirst({
    where: { id, companyId: session.membership.companyId },
    include: {
      contract: true,
      buyer: true,
      project: true,
      items: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!soa) notFound();
  if (soa.projectId) {
    await assertProjectAccess(session, soa.projectId);
  } else {
    notFound();
  }

  const buyerName = soa.buyer
    ? fullName(soa.buyer.firstName, soa.buyer.lastName)
    : fullName(soa.contract?.buyerFirstName, soa.contract?.buyerLastName) ||
      "Client";
  const address =
    soa.contract?.municipalAddress ||
    soa.project?.name ||
    soa.contract?.projectName ||
    "Site Address";
  const categories = Array.from(new Set(soa.items.map((i) => i.category))).sort();

  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-neutral-900 print:bg-white print:py-0">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 pb-6 print:hidden">
        <Link
          href="/client/documents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to documents
        </Link>
        <PrintPageButton />
      </div>

      <div className="mx-auto max-w-4xl rounded-xl border border-neutral-200 bg-white p-10 shadow-lg print:max-w-none print:border-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-neutral-300 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 uppercase">
              Schedule of Allowances (SOA)
            </h1>
            <p className="mt-0.5 text-sm font-medium text-neutral-600">
              {soa.contract?.builderName || "Sunview Custom Homes Ltd."}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="text-sm font-bold text-neutral-900">{soa.soaNumber}</p>
            <p className="text-neutral-500">Version: v{soa.version}</p>
            <p className="text-neutral-500">
              Contract: {soa.contract?.contractNumber || "PC"}
            </p>
            <p className="text-neutral-500">Status: {soa.status}</p>
            <p className="text-neutral-500">Date: {formatDate(soa.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 border-b border-neutral-200 py-6 text-xs">
          <div>
            <h2 className="mb-1 font-bold uppercase tracking-wider text-neutral-500">
              Client / Buyer
            </h2>
            <p className="text-sm font-bold text-neutral-900">{buyerName}</p>
          </div>
          <div>
            <h2 className="mb-1 font-bold uppercase tracking-wider text-neutral-500">
              Project / Property
            </h2>
            <p className="text-sm font-bold text-neutral-900">{address}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-b border-neutral-200 py-6 text-center text-xs">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Total Budgeted Allowance
            </span>
            <span className="mt-1 block font-mono text-lg font-bold">
              {formatCurrency(soa.totalAllowance)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Committed to Selections
            </span>
            <span className="mt-1 block font-mono text-lg font-bold">
              {formatCurrency(soa.committedAmount)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Remaining Allowance
            </span>
            <span className="mt-1 block font-mono text-lg font-bold">
              {formatCurrency(soa.remainingAmount)}
            </span>
          </div>
        </div>

        <div className="space-y-6 py-6 text-xs">
          {categories.map((cat) => {
            const catItems = soa.items.filter((i) => i.category === cat);
            const catTotal = catItems.reduce((s, i) => s + Number(i.amount), 0);
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center justify-between border-b border-neutral-300 pb-1">
                  <h3 className="font-bold uppercase tracking-wider text-neutral-900">
                    {cat}
                  </h3>
                  <span className="font-mono font-bold">
                    {formatCurrency(catTotal)}
                  </span>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-neutral-100 text-[10px] uppercase text-neutral-400">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-right">Allowance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {catItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 pr-4 font-medium text-neutral-900">
                          {item.name}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold">
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
      </div>
    </div>
  );
}
