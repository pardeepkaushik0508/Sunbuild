import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ContractStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireApiSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  toSafeErrorMessage,
} from "@/lib/errors";
import { saveCompanyUpload } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import {
  UPLOAD_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Upload signed contract PDF via API (avoids Server Action CSRF issues on Render).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    requireCapability(session, "manageContracts");
    assertRateLimit(
      clientKeyFromHeaders(
        request.headers,
        `contract-signed-upload:${session.user.id}`
      ),
      UPLOAD_RATE.limit,
      UPLOAD_RATE.windowMs
    );

    const { id: contractId } = await context.params;
    const companyId = session.membership.companyId;

    const existing = await prisma.purchaseContract.findFirst({
      where: {
        id: contractId,
        OR: [
          { companyId },
          { companyId: null, project: { companyId } },
          { companyId: null },
        ],
      },
      select: {
        id: true,
        companyId: true,
        project: { select: { companyId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const tenantId =
      existing.companyId ?? existing.project?.companyId ?? null;
    if (tenantId && tenantId !== companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Signed PDF file required" },
        { status: 400 }
      );
    }

    const saved = await saveCompanyUpload(
      companyId,
      file,
      "contracts/signed"
    );

    await prisma.purchaseContract.update({
      where: { id: contractId },
      data: {
        ...(existing.companyId ? {} : { companyId }),
        signedFilePath: saved.filePath,
        signedFileName: saved.fileName,
        signedStoragePublicId: saved.publicId,
        status: ContractStatus.SIGNED,
      },
    });

    await writeAudit({
      userId: session.user.id,
      companyId,
      action: "CONTRACT_SIGNED_UPLOADED",
      entityType: "PurchaseContract",
      entityId: contractId,
      metadata: { fileName: saved.fileName },
    });

    revalidatePath(`/sales/contracts/${contractId}`);
    return NextResponse.json({
      success: true,
      fileName: saved.fileName,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    if (err instanceof ForbiddenError || err instanceof AppError) {
      return NextResponse.json(
        { error: toSafeErrorMessage(err) },
        { status: err instanceof AppError ? err.status : 403 }
      );
    }
    console.error("[api/contracts/signed POST]", err);
    return NextResponse.json(
      {
        error:
          "Failed to upload signed PDF. Please verify file storage configuration or try again.",
      },
      { status: 500 }
    );
  }
}
