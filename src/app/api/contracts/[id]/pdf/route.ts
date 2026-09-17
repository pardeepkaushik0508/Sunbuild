import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, assertContractAccess } from "@/lib/session";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { generateContractPdfBuffer } from "@/lib/contracts/pdf-service";
import { fullName } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const companyId = session.membership.companyId;

    const contract = await prisma.purchaseContract.findFirst({
      where: {
        OR: [{ id }, { contractNumber: id }],
      },
      include: {
        scheduleOfAllowances: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
        deposits: { orderBy: { dueDate: "asc" } },
        conditions: { orderBy: { dueDate: "asc" } },
        project: {
          include: {
            changeOrders: { orderBy: { createdAt: "desc" }, take: 8 },
          },
        },
        company: true,
      },
    });

    if (!contract) {
      return new NextResponse("Contract not found", { status: 404 });
    }

    const tenantId = contract.companyId ?? contract.project?.companyId ?? null;
    if (tenantId && tenantId !== companyId) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (contract.companyId && contract.companyId !== companyId) {
      return new NextResponse("Forbidden", { status: 403 });
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
      firmPossessionDate: contract.targetClosing,
      builderName: contract.builderName || "Sunview Custom Homes",
      buyerName,
      buyerEmail: contract.buyerEmail,
      buyerPhone: contract.buyerPhone,
      buyerAddress: contract.buyerMailing,
      projectName: contract.projectName,
      municipalAddress: contract.municipalAddress,
      legalAddress: contract.legalAddress,
      lotBlockPlan: contract.lotBlockPlan,
      city: contract.company?.city ?? null,
      basePrice: contract.basePrice ?? 0,
      allowanceTotal: contract.allowanceTotal ?? 0,
      upgradesTotal: contract.upgradesTotal ?? 0,
      discountsTotal: contract.discountsTotal ?? 0,
      subtotal: (contract.basePrice ?? 0) + (contract.allowanceTotal ?? 0),
      taxRate: contract.taxRate ?? 5.0,
      taxAmount: contract.taxAmount ?? 0,
      gstRebate: contract.discountsTotal ?? 0,
      totalContractPrice:
        contract.totalContractPrice ?? contract.purchasePrice ?? 0,
      deposits: contract.deposits.map((d) => ({
        label: d.label,
        amount: d.amount,
        dueDate: d.dueDate,
      })),
      conditions: contract.conditions.map((c) => ({
        title: c.title,
        description: c.description,
        dueDate: c.dueDate,
        party: /builder/i.test(c.title) ? "builder" : "purchaser",
      })),
      changeOrders: (contract.project?.changeOrders || []).map((co) => ({
        title: co.title,
        amount: co.amount,
      })),
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
        "Content-Disposition": `attachment; filename="${contract.contractNumber || "sales-information-sheet"}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[contracts/pdf]", err);
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
}
