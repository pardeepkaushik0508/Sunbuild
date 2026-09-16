import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, assertProjectAccess } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { generateSoaPdfBuffer } from "@/lib/contracts/pdf-service";
import { fullName } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  const { id } = await context.params;

  const soa = await prisma.scheduleOfAllowances.findFirst({
    where: {
      OR: [{ id }, { soaNumber: id }],
      companyId: session.membership.companyId,
    },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      contract: true,
      buyer: true,
      project: true,
    },
  });

  if (!soa) {
    return new NextResponse("Schedule of Allowances not found", { status: 404 });
  }

  if (soa.projectId) {
    await assertProjectAccess(session, soa.projectId);
  } else {
    requireCapability(session, "manageContracts");
  }

  const clientName =
    (soa.buyer && fullName(soa.buyer.firstName, soa.buyer.lastName)) ||
    fullName(soa.contract?.buyerFirstName, soa.contract?.buyerLastName) ||
    "Client";

  const pdfBuffer = await generateSoaPdfBuffer({
    soaNumber: soa.soaNumber,
    contractNumber: soa.contract?.contractNumber || "PC-DRAFT",
    version: soa.version,
    clientName,
    projectName: soa.project?.name || soa.contract?.projectName,
    propertyAddress: soa.project?.municipalAddress || soa.contract?.municipalAddress,
    totalAllowance: soa.totalAllowance,
    effectiveDate: soa.effectiveDate,
    notes: soa.notes,
    items: soa.items.map((i) => ({
      category: i.category,
      name: i.name,
      description: i.description,
      location: i.location,
      quantity: i.quantity,
      unit: i.unit,
      amount: i.amount,
      selectionDueDate: i.selectionDueDate,
    })),
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${soa.soaNumber}.pdf"`,
    },
  });
}
