"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ContractStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError, ForbiddenError } from "@/lib/errors";
import { saveCompanyUpload, storageMeta } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { ACTION_RATE, UPLOAD_RATE, assertRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import {
  generateContractNumber,
  generateSoaNumber,
  calculateContractTotals,
  executeContractTransaction,
} from "@/lib/contracts/contracts";
import {
  formFloat,
  formString,
  parseSalesSheetContractFields,
  syncContractDepositsAndConditions,
} from "@/lib/sales/contract-form-fields";

async function rateLimit(userId: string, kind: string, upload = false) {
  const h = await headers();
  const cfg = upload ? UPLOAD_RATE : ACTION_RATE;
  assertRateLimit(
    clientKeyFromHeaders(h, `${kind}:${userId}`),
    cfg.limit,
    cfg.windowMs
  );
}

/**
 * Creates a new Purchase Contract along with its initial Schedule of Allowances (SOA).
 */
export async function createPurchaseContractAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "contract-create");

  const companyId = session.membership.companyId;
  const leadId = formString(form, "leadId") || null;
  const buyerId = formString(form, "buyerId") || null;
  const projectId = formString(form, "projectId") || null;

  const sheet = parseSalesSheetContractFields(form);

  const basePrice = formFloat(form, "basePrice") ?? 0;
  const allowanceTotal = formFloat(form, "allowanceTotal") ?? 0;
  const upgradesTotal = formFloat(form, "upgradesTotal") ?? 0;
  const discountsTotal = sheet.discountsTotal ?? 0;
  const taxRate = formFloat(form, "taxRate") ?? 5.0;

  const totals = calculateContractTotals({
    basePrice,
    allowanceTotal,
    upgradesTotal,
    discountsTotal,
    taxRate,
  });

  let fileMeta: Partial<ReturnType<typeof storageMeta>> = {};
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const saved = await saveCompanyUpload(companyId, file, "contracts");
    fileMeta = storageMeta(saved);
  }

  const contract = await prisma.$transaction(async (tx) => {
    const contractNumber = await generateContractNumber(companyId, tx);
    const soaNumber = await generateSoaNumber(companyId, tx);

    let resolvedBuyerId = buyerId;
    if (!resolvedBuyerId && sheet.buyerFirstName && sheet.buyerLastName) {
      const buyer = await tx.buyer.create({
        data: {
          firstName: sheet.buyerFirstName,
          lastName: sheet.buyerLastName,
          email: sheet.buyerEmail,
          phone: sheet.buyerPhone,
          mailingAddress: sheet.buyerMailing,
        },
      });
      resolvedBuyerId = buyer.id;
    }

    const createdContract = await tx.purchaseContract.create({
      data: {
        companyId,
        projectId,
        buyerId: resolvedBuyerId,
        leadId,
        salesPersonId: session.user.id,
        contractNumber,
        version: 1,
        status: ContractStatus.DRAFT,
        uploadedById: session.user.id,
        contractDate: sheet.contractDate,
        effectiveDate: sheet.effectiveDate,
        targetClosing: sheet.targetClosing,
        firmPossessionDate: sheet.firmPossessionDate,
        builderSignatureDate: sheet.builderSignatureDate,
        purchaserAgreementReceiptDate: sheet.purchaserAgreementReceiptDate,
        projectName: sheet.projectName,
        municipalAddress: sheet.municipalAddress,
        legalAddress: sheet.legalAddress,
        lotBlockPlan: sheet.lotBlockPlan,
        city: sheet.city,
        block: sheet.block,
        lot: sheet.lot,
        plan: sheet.plan,
        buyerFirstName: sheet.buyerFirstName,
        buyerLastName: sheet.buyerLastName,
        buyerEmail: sheet.buyerEmail,
        buyerPhone: sheet.buyerPhone,
        buyerMailing: sheet.buyerMailing,
        buyerOccupation: sheet.buyerOccupation,
        buyerIdNumber: sheet.buyerIdNumber,
        buyer2FirstName: sheet.buyer2FirstName,
        buyer2LastName: sheet.buyer2LastName,
        buyer2Email: sheet.buyer2Email,
        buyer2Phone: sheet.buyer2Phone,
        buyer2Mailing: sheet.buyer2Mailing,
        buyer2Occupation: sheet.buyer2Occupation,
        buyer2IdNumber: sheet.buyer2IdNumber,
        realtorName: sheet.realtorName,
        realtorPhone: sheet.realtorPhone,
        realtorEmail: sheet.realtorEmail,
        lawyerName: sheet.lawyerName,
        lawyerPhone: sheet.lawyerPhone,
        lawyerEmail: sheet.lawyerEmail,
        changeOrderNotes: sheet.changeOrderNotes,
        builderName: sheet.builderName,
        basePrice: totals.basePrice,
        allowanceTotal: totals.allowanceTotal,
        upgradesTotal: totals.upgradesTotal,
        discountsTotal: totals.discountsTotal,
        gstRebate: sheet.gstRebate,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        totalContractPrice: totals.totalContractPrice,
        purchasePrice: totals.totalContractPrice,
        scopeSummary: sheet.scopeSummary,
        inclusions: sheet.inclusions,
        exclusions: sheet.exclusions,
        specialConditions: sheet.specialConditions,
        clientTerms: sheet.clientTerms,
        internalNotes: sheet.internalNotes,
        ...fileMeta,
      },
    });

    await tx.scheduleOfAllowances.create({
      data: {
        soaNumber,
        contractId: createdContract.id,
        companyId,
        projectId,
        buyerId: resolvedBuyerId,
        version: 1,
        status: "DRAFT",
        totalAllowance: totals.allowanceTotal,
        remainingAmount: totals.allowanceTotal,
      },
    });

    await syncContractDepositsAndConditions(
      tx,
      createdContract.id,
      projectId,
      form
    );

    return createdContract;
  });

  await writeAudit({
    userId: session.user.id,
    companyId,
    projectId,
    action: "CONTRACT_CREATED",
    entityType: "PurchaseContract",
    entityId: contract.id,
    metadata: {
      contractNumber: contract.contractNumber,
      totalContractPrice: contract.totalContractPrice,
    },
  });

  redirect(`/sales/contracts/${contract.id}?created=1`);
}

/**
 * Updates a draft / review purchase contract.
 * Strictly forbidden if the contract is already EXECUTED.
 */
export async function updatePurchaseContractAction(
  contractId: string,
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "contract-update");

  const contract = await prisma.purchaseContract.findUnique({
    where: { id: contractId },
    include: { scheduleOfAllowances: true },
  });

  if (!contract) throw new AppError("Contract not found");
  if (contract.companyId !== session.membership.companyId) {
    throw new ForbiddenError();
  }
  if (contract.status === ContractStatus.EXECUTED) {
    throw new AppError(
      "Contract is executed and locked. Modifications must be processed via Change Order."
    );
  }

  const sheet = parseSalesSheetContractFields(form);

  const basePrice = formFloat(form, "basePrice") ?? contract.basePrice ?? 0;
  const upgradesTotal =
    formFloat(form, "upgradesTotal") ?? contract.upgradesTotal ?? 0;
  const discountsTotal = sheet.discountsTotal ?? contract.discountsTotal ?? 0;
  const taxRate = formFloat(form, "taxRate") ?? contract.taxRate ?? 5.0;
  const allowanceTotal =
    contract.scheduleOfAllowances?.totalAllowance ??
    contract.allowanceTotal ??
    0;

  const totals = calculateContractTotals({
    basePrice,
    allowanceTotal,
    upgradesTotal,
    discountsTotal,
    taxRate,
  });

  await prisma.$transaction(async (tx) => {
    await tx.purchaseContract.update({
      where: { id: contractId },
      data: {
        projectName: sheet.projectName,
        municipalAddress: sheet.municipalAddress,
        legalAddress: sheet.legalAddress,
        lotBlockPlan: sheet.lotBlockPlan,
        city: sheet.city,
        block: sheet.block,
        lot: sheet.lot,
        plan: sheet.plan,
        buyerFirstName: sheet.buyerFirstName,
        buyerLastName: sheet.buyerLastName,
        buyerEmail: sheet.buyerEmail,
        buyerPhone: sheet.buyerPhone,
        buyerMailing: sheet.buyerMailing,
        buyerOccupation: sheet.buyerOccupation,
        buyerIdNumber: sheet.buyerIdNumber,
        buyer2FirstName: sheet.buyer2FirstName,
        buyer2LastName: sheet.buyer2LastName,
        buyer2Email: sheet.buyer2Email,
        buyer2Phone: sheet.buyer2Phone,
        buyer2Mailing: sheet.buyer2Mailing,
        buyer2Occupation: sheet.buyer2Occupation,
        buyer2IdNumber: sheet.buyer2IdNumber,
        realtorName: sheet.realtorName,
        realtorPhone: sheet.realtorPhone,
        realtorEmail: sheet.realtorEmail,
        lawyerName: sheet.lawyerName,
        lawyerPhone: sheet.lawyerPhone,
        lawyerEmail: sheet.lawyerEmail,
        changeOrderNotes: sheet.changeOrderNotes,
        builderName: sheet.builderName,
        contractDate: sheet.contractDate,
        effectiveDate: sheet.effectiveDate,
        targetClosing: sheet.targetClosing,
        firmPossessionDate: sheet.firmPossessionDate,
        builderSignatureDate: sheet.builderSignatureDate,
        purchaserAgreementReceiptDate: sheet.purchaserAgreementReceiptDate,
        basePrice: totals.basePrice,
        allowanceTotal: totals.allowanceTotal,
        upgradesTotal: totals.upgradesTotal,
        discountsTotal: totals.discountsTotal,
        gstRebate: sheet.gstRebate,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        totalContractPrice: totals.totalContractPrice,
        purchasePrice: totals.totalContractPrice,
        scopeSummary: sheet.scopeSummary,
        inclusions: sheet.inclusions,
        exclusions: sheet.exclusions,
        specialConditions: sheet.specialConditions,
        clientTerms: sheet.clientTerms,
        internalNotes: sheet.internalNotes,
        reviewNotes: sheet.reviewNotes,
        status:
          contract.status === ContractStatus.DRAFT
            ? ContractStatus.READY_FOR_REVIEW
            : contract.status,
      },
    });

    await syncContractDepositsAndConditions(
      tx,
      contractId,
      contract.projectId,
      form
    );
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "CONTRACT_UPDATED",
    entityType: "PurchaseContract",
    entityId: contractId,
  });

  revalidatePath(`/sales/contracts/${contractId}`);
}

/**
 * Creates a new contract revision/version before execution.
 * Saves current snapshot in PurchaseContractVersion and increments version.
 */
export async function createContractRevisionAction(
  contractId: string,
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "contract-revision");

  const contract = await prisma.purchaseContract.findUnique({
    where: { id: contractId },
    include: { scheduleOfAllowances: true },
  });

  if (!contract) throw new AppError("Contract not found");
  if (contract.companyId !== session.membership.companyId) {
    throw new ForbiddenError();
  }
  if (contract.status === ContractStatus.EXECUTED) {
    throw new AppError(
      "Executed contracts cannot be revised directly. Use Change Orders."
    );
  }

  const reason = formString(form, "reason") || "Sales contract revision";

  await prisma.$transaction(async (tx) => {
    await tx.purchaseContractVersion.create({
      data: {
        contractId,
        version: contract.version,
        contractNumber: contract.contractNumber || "PC-DRAFT",
        purchasePrice: contract.totalContractPrice ?? contract.purchasePrice,
        basePrice: contract.basePrice,
        allowanceTotal: contract.allowanceTotal,
        snapshotData: {
          ...contract,
          archivedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        filePath: contract.filePath,
        fileName: contract.fileName,
        createdById: session.user.id,
        reason,
      },
    });

    await tx.purchaseContract.update({
      where: { id: contractId },
      data: {
        version: contract.version + 1,
        status: ContractStatus.DRAFT,
      },
    });

    if (contract.scheduleOfAllowances) {
      await tx.scheduleOfAllowances.update({
        where: { id: contract.scheduleOfAllowances.id },
        data: {
          version: contract.version + 1,
        },
      });
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "CONTRACT_REVISION_CREATED",
    entityType: "PurchaseContract",
    entityId: contractId,
    metadata: {
      newVersion: contract.version + 1,
      reason,
    },
  });

  revalidatePath(`/sales/contracts/${contractId}`);
}

/**
 * Uploads a signed / executed Purchase Contract PDF.
 */
export async function uploadSignedContractAction(
  contractId: string,
  form: FormData
) {
  try {
    const session = await requireSession();
    requireCapability(session, "manageContracts");
    await rateLimit(session.user.id, "contract-signed-upload", true);

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Signed PDF file required" };
    }

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
    if (!existing) return { error: "Contract not found" };

    const tenantId =
      existing.companyId ?? existing.project?.companyId ?? null;
    if (tenantId && tenantId !== companyId) {
      return { error: "Forbidden" };
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
    return { success: true };
  } catch (err) {
    if (err instanceof AppError || err instanceof ForbiddenError) {
      return { error: err.message };
    }
    console.error("[uploadSignedContractAction]", err);
    return {
      error:
        "Failed to upload signed PDF. Please verify file storage configuration or try again.",
    };
  }
}

/**
 * Executes a Purchase Contract, locks values, creates/activates project, and links SOA to selections.
 */
export async function executeContractAction(
  contractId: string,
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "contract-execute");

  const contract = await prisma.purchaseContract.findUnique({
    where: { id: contractId },
    include: {
      deposits: { select: { label: true, amount: true } },
    },
  });
  if (!contract) throw new AppError("Contract not found");
  if (contract.companyId !== session.membership.companyId) {
    throw new ForbiddenError();
  }

  const {
    validateContractActivation,
    formatActivationBlockMessage,
  } = await import("@/lib/contracts/activation-validation");
  const activationIssues = validateContractActivation({
    totalPurchasePrice:
      contract.totalContractPrice ?? contract.purchasePrice ?? null,
    deposits: contract.deposits,
    possessionDate:
      contract.firmPossessionDate ?? contract.targetClosing ?? null,
  });
  if (activationIssues.length) {
    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      projectId: contract.projectId,
      action: "CONTRACT_ACTIVATION_BLOCKED",
      entityType: "PurchaseContract",
      entityId: contractId,
      metadata: { issues: activationIssues, path: "execute" },
    });
    throw new AppError(formatActivationBlockMessage(activationIssues));
  }

  const pmId = formString(form, "pmId") || null;

  const result = await executeContractTransaction({
    contractId,
    userId: session.user.id,
    companyId: session.membership.companyId,
    pmId,
  });

  revalidatePath(`/sales/contracts/${contractId}`);
  revalidatePath("/sales/contracts");
  revalidatePath(`/pm/projects/${result.projectId}`);
  revalidatePath("/pm/projects");
  revalidatePath("/pm/selections");

  redirect(`/sales/contracts/${contractId}`);
}

/**
 * Deletes an unexecuted draft contract.
 */
export async function deleteDraftContractAction(contractId: string) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "contract-delete");

  const contract = await prisma.purchaseContract.findUnique({
    where: { id: contractId },
    select: { status: true, companyId: true },
  });

  if (!contract) throw new AppError("Contract not found");
  if (contract.companyId !== session.membership.companyId) {
    throw new ForbiddenError();
  }
  if (contract.status === ContractStatus.EXECUTED) {
    throw new AppError("Executed contracts cannot be deleted.");
  }

  await prisma.purchaseContract.delete({
    where: { id: contractId },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "CONTRACT_DELETED",
    entityType: "PurchaseContract",
    entityId: contractId,
  });

  redirect("/sales/contracts");
}
