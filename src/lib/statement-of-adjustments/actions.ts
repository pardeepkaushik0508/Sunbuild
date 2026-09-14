"use server";

import {
  Role,
  StatementOfAdjustmentsStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession, assertProjectAccess } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { saveUpload, storageMeta } from "@/lib/storage";
import {
  loadStatementOfAdjustmentsForProject,
  nextStatementVersion,
} from "./load";
import {
  generateStatementOfAdjustmentsPdfBuffer,
  soaPdfFilename,
} from "./pdf";

function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function formFloat(form: FormData, key: string) {
  const raw = formString(form, key);
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const VIEW_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
  Role.SALES_MANAGER,
];

const EDIT_PROMO_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.BOOKKEEPER,
];

const FINALIZE_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.BOOKKEEPER,
];

function assertSoaViewRole(role: Role) {
  if (!VIEW_ROLES.includes(role)) {
    throw new AppError("Not authorized to view Statement of Adjustments", 403);
  }
}

export async function ensureStatementOfAdjustmentsAction(projectId: string) {
  const session = await requireSession();
  assertSoaViewRole(session.membership.role);
  requireCapability(session, "viewStatementOfAdjustments");
  await assertProjectAccess(session, projectId);

  const loaded = await loadStatementOfAdjustmentsForProject({
    projectId,
    companyId: session.membership.companyId,
    ensureDraft: true,
    userId: session.user.id,
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "SOA_VIEW",
    entityType: "StatementOfAdjustments",
    entityId: loaded.record?.id,
  });

  return loaded.record?.id ?? null;
}

export async function updateSoaPromoCreditAction(form: FormData) {
  const session = await requireSession();
  if (!EDIT_PROMO_ROLES.includes(session.membership.role)) {
    throw new AppError("Not authorized to edit promo credit", 403);
  }
  requireCapability(session, "manageStatementOfAdjustments");

  const statementId = formString(form, "statementId");
  const promo = formFloat(form, "promoCreditAdjustment") ?? 0;
  if (promo < 0) throw new AppError("Promo credit cannot be negative");

  const statement = await prisma.statementOfAdjustments.findFirst({
    where: {
      id: statementId,
      companyId: session.membership.companyId,
    },
  });
  if (!statement) throw new AppError("Statement not found", 404);
  await assertProjectAccess(session, statement.projectId);

  if (statement.status === StatementOfAdjustmentsStatus.FINALIZED) {
    throw new AppError(
      "Finalized statements cannot be edited. Create a new version."
    );
  }

  await prisma.statementOfAdjustments.update({
    where: { id: statement.id },
    data: { promoCreditAdjustment: promo },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: statement.projectId,
    action: "SOA_PROMO_UPDATE",
    entityType: "StatementOfAdjustments",
    entityId: statement.id,
    metadata: { promoCreditAdjustment: promo },
  });

  revalidatePath(
    `/pm/projects/${statement.projectId}/statement-of-adjustments`
  );
}

export async function finalizeStatementOfAdjustmentsAction(form: FormData) {
  const session = await requireSession();
  if (!FINALIZE_ROLES.includes(session.membership.role)) {
    throw new AppError(
      "Not authorized to finalize Statement of Adjustments",
      403
    );
  }
  requireCapability(session, "manageStatementOfAdjustments");

  const statementId = formString(form, "statementId");
  const statement = await prisma.statementOfAdjustments.findFirst({
    where: {
      id: statementId,
      companyId: session.membership.companyId,
    },
  });
  if (!statement) throw new AppError("Statement not found", 404);
  await assertProjectAccess(session, statement.projectId);

  if (statement.status === StatementOfAdjustmentsStatus.FINALIZED) {
    throw new AppError("Statement is already finalized");
  }

  const loaded = await loadStatementOfAdjustmentsForProject({
    projectId: statement.projectId,
    companyId: session.membership.companyId,
    statementId: statement.id,
  });

  if (!loaded.canGeneratePdf) {
    throw new AppError(
      loaded.issues.map((i) => i.message).join(" ") ||
        "Cannot finalize — required project data is incomplete."
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

  const file = new File([new Uint8Array(pdfBuffer)], fileName, {
    type: "application/pdf",
  });
  const uploaded = await saveUpload(
    file,
    `statement-of-adjustments/${statement.projectId}`,
    {
      maxUploadBytes: 15 * 1024 * 1024,
      allowedExtensions: [".pdf"],
    }
  );
  const meta = storageMeta(uploaded);

  await prisma.statementOfAdjustments.update({
    where: { id: statement.id },
    data: {
      status: StatementOfAdjustmentsStatus.FINALIZED,
      financialSnapshot: loaded.calculations as object,
      finalizedAt: new Date(),
      finalizedById: session.user.id,
      pdfPath: meta.filePath,
      pdfFileName: meta.fileName,
      pdfStoragePublicId: meta.storagePublicId,
      purchaseContractId: loaded.contractId,
    },
  });

  const nextVersion = await nextStatementVersion(statement.projectId);
  await prisma.statementOfAdjustments.create({
    data: {
      companyId: session.membership.companyId,
      projectId: statement.projectId,
      purchaseContractId: loaded.contractId,
      statementNumber: `${statement.statementNumber}-v${nextVersion}`,
      version: nextVersion,
      statementDate: new Date(),
      status: StatementOfAdjustmentsStatus.DRAFT,
      promoCreditAdjustment: statement.promoCreditAdjustment,
      generatedById: session.user.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: statement.projectId,
    action: "SOA_FINALIZE",
    entityType: "StatementOfAdjustments",
    entityId: statement.id,
    metadata: { version: statement.version, fileName },
  });

  revalidatePath(
    `/pm/projects/${statement.projectId}/statement-of-adjustments`
  );
}
