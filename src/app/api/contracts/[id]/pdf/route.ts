import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, assertContractAccess } from "@/lib/session";
import { generateContractPdfBuffer } from "@/lib/contracts/pdf-service";
import { fullName } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  const { id } = await context.params;

  const contract = await prisma.purchaseContract.findFirst({
    where: {
      OR: [{ id }, { contractNumber: id }],
      companyId: session.membership.companyId,
    },
    include: {
      scheduleOfAllowances: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!contract) {
    return new NextResponse("Contract not found", { status: 404 });
  }

  await assertContractAccess(session, contract.id);

  const buyerName =
    fullName(contract.buyerFirstName, contract.buyerLastName) || "Client";

  const pdfBuffer = await generateContractPdfBuffer({
    contractNumber: contract.contractNumber || "PC-DRAFT",
    version: contract.version,
    contractDate: contract.contractDate,
    effectiveDate: contract.effectiveDate,
    targetClosing: contract.targetClosing,
    builderName: contract.builderName || "Sunview Custom Homes",
    buyerName,
    buyerEmail: contract.buyerEmail,
    buyerPhone: contract.buyerPhone,
    buyerAddress: contract.buyerMailing,
    projectName: contract.projectName,
    municipalAddress: contract.municipalAddress,
    legalAddress: contract.legalAddress,
    lotBlockPlan: contract.lotBlockPlan,
    basePrice: contract.basePrice ?? 0,
    allowanceTotal: contract.allowanceTotal ?? 0,
    upgradesTotal: contract.upgradesTotal ?? 0,
    discountsTotal: contract.discountsTotal ?? 0,
    subtotal: (contract.basePrice ?? 0) + (contract.allowanceTotal ?? 0),
    taxRate: contract.taxRate ?? 5.0,
    taxAmount: contract.taxAmount ?? 0,
    totalContractPrice: contract.totalContractPrice ?? contract.purchasePrice ?? 0,
    scopeSummary: contract.scopeSummary,
    inclusions: contract.inclusions,
    exclusions: contract.exclusions,
    specialConditions: contract.specialConditions,
    clientTerms: contract.clientTerms,
    status: contract.status,
    soaItems: contract.scheduleOfAllowances?.items.map((i) => ({
      category: i.category,
      name: i.name,
      location: i.location,
      amount: i.amount,
      notes: i.notes,
    })),
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${contract.contractNumber || "purchase-contract"}.pdf"`,
    },
  });
}
