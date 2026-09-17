import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, assertContractAccess } from "@/lib/session";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { generateContractPdfBuffer } from "@/lib/contracts/pdf-service";
import { mapContractToPrintableData } from "@/lib/contracts/printable-contract";

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
        deposits: { orderBy: { createdAt: "asc" } },
        conditions: { orderBy: { createdAt: "asc" } },
        buyer: true,
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

    const pdfBuffer = await generateContractPdfBuffer(
      mapContractToPrintableData(contract)
    );

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
