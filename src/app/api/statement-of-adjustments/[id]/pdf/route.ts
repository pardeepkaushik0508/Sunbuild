import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, assertProjectAccess } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { writeAudit } from "@/lib/audit";
import { loadStatementOfAdjustmentsForProject } from "@/lib/statement-of-adjustments/load";
import {
  generateStatementOfAdjustmentsPdfBuffer,
  soaPdfFilename,
} from "@/lib/statement-of-adjustments/pdf";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/statement-of-adjustments/[id]/pdf
 * id = StatementOfAdjustments id OR projectId (creates/uses draft)
 * ?preview=1 → inline disposition
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await requireSession();
  requireCapability(session, "viewStatementOfAdjustments");
  const { id } = await context.params;
  const preview = request.nextUrl.searchParams.get("preview") === "1";

  let statement = await prisma.statementOfAdjustments.findFirst({
    where: {
      OR: [{ id }, { statementNumber: id }],
      companyId: session.membership.companyId,
    },
  });

  let projectId = statement?.projectId ?? null;

  if (!statement) {
    // Treat id as projectId — ensure draft then load
    const project = await prisma.project.findFirst({
      where: { id, companyId: session.membership.companyId },
      select: { id: true },
    });
    if (!project) {
      return new NextResponse("Statement of Adjustments not found", {
        status: 404,
      });
    }
    projectId = project.id;
    await assertProjectAccess(session, projectId);

    const loadedEnsure = await loadStatementOfAdjustmentsForProject({
      projectId,
      companyId: session.membership.companyId,
      ensureDraft: true,
      userId: session.user.id,
    });
    statement = loadedEnsure.record;
  } else {
    await assertProjectAccess(session, statement.projectId);
  }

  if (!statement || !projectId) {
    return new NextResponse("Statement of Adjustments not found", {
      status: 404,
    });
  }

  const loaded = await loadStatementOfAdjustmentsForProject({
    projectId: statement.projectId,
    companyId: session.membership.companyId,
    statementId: statement.id,
  });

  if (!loaded.canGeneratePdf) {
    return NextResponse.json(
      {
        error: "Incomplete project data",
        issues: loaded.issues,
      },
      { status: 422 }
    );
  }

  const pdfBuffer = await generateStatementOfAdjustmentsPdfBuffer({
    companyLegal: loaded.companyLegal,
    party: loaded.party,
    calculations: loaded.calculations,
    statementNumber: statement.statementNumber,
    projectName: loaded.projectName,
  });

  const fileName = soaPdfFilename({
    statementNumber: statement.statementNumber,
    projectName: loaded.projectName,
    contractNumber: loaded.party.contractNumber,
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: statement.projectId,
    action: preview ? "SOA_PDF_PREVIEW" : "SOA_PDF_DOWNLOAD",
    entityType: "StatementOfAdjustments",
    entityId: statement.id,
    metadata: { fileName },
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
