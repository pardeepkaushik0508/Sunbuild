import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireRole, assertContractAccess } from "@/lib/session";
import { prisma } from "@/lib/db";
import { generateContractHtml } from "@/lib/contracts/pdf-service";
import { mapContractToPrintableData } from "@/lib/contracts/printable-contract";
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

  const contract = await prisma.purchaseContract.findFirst({
    where: {
      OR: [{ id }, { contractNumber: id }],
    },
    include: {
      scheduleOfAllowances: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      deposits: { orderBy: { createdAt: "asc" } },
      conditions: { orderBy: { createdAt: "asc" } },
      buyer: true,
      company: true,
      project: {
        select: {
          id: true,
          companyId: true,
          name: true,
          changeOrders: { orderBy: { createdAt: "desc" }, take: 8 },
        },
      },
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

  const backHref =
    session.membership.role === Role.CLIENT
      ? "/client/documents"
      : `/sales/contracts/${contract.id}`;

  const sheetHtml = generateContractHtml(mapContractToPrintableData(contract));

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 pb-6 print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="flex items-center gap-3">
          <a
            href={`/api/contracts/${contract.id}/pdf`}
            className="text-xs font-semibold text-neutral-600 underline hover:text-neutral-900"
          >
            Download PDF
          </a>
          <PrintPageButton />
        </div>
      </div>
      <iframe
        title="Sales Information Sheet"
        className="mx-auto block w-full max-w-4xl min-h-[1100px] rounded-xl border border-neutral-200 bg-white shadow-lg print:max-w-none print:border-none print:shadow-none"
        srcDoc={sheetHtml}
      />
    </div>
  );
}
