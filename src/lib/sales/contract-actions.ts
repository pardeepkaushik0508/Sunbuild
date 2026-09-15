"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ContractStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { saveCompanyUpload, storageMeta } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { ACTION_RATE, UPLOAD_RATE, assertRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import {
  generateContractNumber,
  generateSoaNumber,
  calculateContractTotals,
  executeContractTransaction,
  roundMoney,
} from "@/lib/contracts/contracts";

function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function formFloat(form: FormData, key: string): number | null {
  const v = formString(form, key);
  if (!v) return null;
  const num = parseFloat(v);
  return Number.isNaN(num) ? null : roundMoney(num);
}

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

  const buyerFirstName = formString(form, "buyerFirstName") || null;
  const buyerLastName = formString(form, "buyerLastName") || null;
  const buyerEmail = formString(form, "buyerEmail") || null;
  const buyerPhone = formString(form, "buyerPhone") || null;
  const buyerMailing = formString(form, "buyerMailing") || null;

  const projectName = formString(form, "projectName") || null;
  const municipalAddress = formString(form, "municipalAddress") || null;
  const legalAddress = formString(form, "legalAddress") || null;
  const lotBlockPlan = formString(form, "lotBlockPlan") || null;
  const builderName = formString(form, "builderName") || "Sunview Custom Homes";

  const contractDateRaw = formString(form, "contractDate");
  const effectiveDateRaw = formString(form, "effectiveDate");
  const targetClosingRaw = formString(form, "targetClosing");

  const contractDate = contractDateRaw ? new Date(contractDateRaw) : new Date();
  const effectiveDate = effectiveDateRaw ? new Date(effectiveDateRaw) : null;
  const targetClosing = targetClosingRaw ? new Date(targetClosingRaw) : null;

  const basePrice = formFloat(form, "basePrice") ?? 0;
  const allowanceTotal = formFloat(form, "allowanceTotal") ?? 0;
  const upgradesTotal = formFloat(form, "upgradesTotal") ?? 0;
  const discountsTotal = formFloat(form, "discountsTotal") ?? 0;
  const taxRate = formFloat(form, "taxRate") ?? 5.0;

  const totals = calculateContractTotals({
    basePrice,
    allowanceTotal,
    upgradesTotal,
    discountsTotal,
    taxRate,
  });

  const scopeSummary = formString(form, "scopeSummary") || null;
  const inclusions = formString(form, "inclusions") || null;
  const exclusions = formString(form, "exclusions") || null;
  const specialConditions = formString(form, "specialConditions") || null;
  const clientTerms = formString(form, "clientTerms") || null;
  const internalNotes = formString(form, "internalNotes") || null;

  // Handle uploaded file if present
  let fileMeta: Record<string, any> = {};
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const saved = await saveCompanyUpload(companyId, file, "contracts");
    fileMeta = storageMeta(saved);
  }

  const contract = await prisma.$transaction(async (tx) => {
    const contractNumber = await generateContractNumber(companyId, tx);
    const soaNumber = await generateSoaNumber(companyId, tx);

    let resolvedBuyerId = buyerId;
    if (!resolvedBuyerId && buyerFirstName && buyerLastName) {
      const buyer = await tx.buyer.create({
        data: {
          firstName: buyerFirstName,
          lastName: buyerLastName,
          email: buyerEmail,
          phone: buyerPhone,
          mailingAddress: buyerMailing,
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
        contractDate,
        effectiveDate,
        targetClosing,
        projectName,
        municipalAddress,
        legalAddress,
        lotBlockPlan,
        buyerFirstName,
        buyerLastName,
        buyerEmail,
        buyerPhone,
        buyerMailing,
        builderName,
        basePrice: totals.basePrice,
        allowanceTotal: totals.allowanceTotal,
        upgradesTotal: totals.upgradesTotal,
        discountsTotal: totals.discountsTotal,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        totalContractPrice: totals.totalContractPrice,
        purchasePrice: totals.totalContractPrice,
        scopeSummary,
        inclusions,
        exclusions,
        specialConditions,
        clientTerms,
        internalNotes,
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
  if (contract.status === ContractStatus.EXECUTED) {
    throw new AppError(
      "Contract is executed and locked. Modifications must be processed via Change Order."
    );
  }

  const basePrice = formFloat(form, "basePrice") ?? contract.basePrice ?? 0;
  const upgradesTotal = formFloat(form, "upgradesTotal") ?? contract.upgradesTotal ?? 0;
  const discountsTotal = formFloat(form, "discountsTotal") ?? contract.discountsTotal ?? 0;
  const taxRate = formFloat(form, "taxRate") ?? contract.taxRate ?? 5.0;
  const allowanceTotal = contract.scheduleOfAllowances?.totalAllowance ?? contract.allowanceTotal ?? 0;

  const totals = calculateContractTotals({
    basePrice,
    allowanceTotal,
    upgradesTotal,
    discountsTotal,
    taxRate,
  });

  const contractDateRaw = formString(form, "contractDate");
  const effectiveDateRaw = formString(form, "effectiveDate");
  const targetClosingRaw = formString(form, "targetClosing");

  await prisma.purchaseContract.update({
    where: { id: contractId },
    data: {
      projectName: formString(form, "projectName") || null,
      municipalAddress: formString(form, "municipalAddress") || null,
      legalAddress: formString(form, "legalAddress") || null,
      lotBlockPlan: formString(form, "lotBlockPlan") || null,
      buyerFirstName: formString(form, "buyerFirstName") || null,
      buyerLastName: formString(form, "buyerLastName") || null,
      buyerEmail: formString(form, "buyerEmail") || null,
      buyerPhone: formString(form, "buyerPhone") || null,
      buyerMailing: formString(form, "buyerMailing") || null,
      builderName: formString(form, "builderName") || "Sunview Custom Homes",
      contractDate: contractDateRaw ? new Date(contractDateRaw) : undefined,
      effectiveDate: effectiveDateRaw ? new Date(effectiveDateRaw) : null,
      targetClosing: targetClosingRaw ? new Date(targetClosingRaw) : null,
      basePrice: totals.basePrice,
      allowanceTotal: totals.allowanceTotal,
      upgradesTotal: totals.upgradesTotal,
      discountsTotal: totals.discountsTotal,
      taxRate: totals.taxRate,
      taxAmount: totals.taxAmount,
      totalContractPrice: totals.totalContractPrice,
      purchasePrice: totals.totalContractPrice,
      scopeSummary: formString(form, "scopeSummary") || null,
      inclusions: formString(form, "inclusions") || null,
      exclusions: formString(form, "exclusions") || null,
      specialConditions: formString(form, "specialConditions") || null,
      clientTerms: formString(form, "clientTerms") || null,
      internalNotes: formString(form, "internalNotes") || null,
      reviewNotes: formString(form, "reviewNotes") || null,
      status:
        contract.status === ContractStatus.DRAFT
          ? ContractStatus.READY_FOR_REVIEW
          : contract.status,
    },
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
  if (contract.status === ContractStatus.EXECUTED) {
    throw new AppError(
      "Executed contracts cannot be revised directly. Use Change Orders."
    );
  }

  const reason = formString(form, "reason") || "Sales contract revision";

  await prisma.$transaction(async (tx) => {
    // Archive current snapshot into PurchaseContractVersion
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
        } as any,
        filePath: contract.filePath,
        fileName: contract.fileName,
        createdById: session.user.id,
        reason,
      },
    });

    // Increment version
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
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "contract-signed-upload", true);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("Signed PDF file required");
  }

  const saved = await saveCompanyUpload(
    session.membership.companyId,
    file,
    "contracts/signed"
  );

  await prisma.purchaseContract.update({
    where: { id: contractId },
    data: {
      signedFilePath: saved.filePath,
      signedFileName: saved.fileName,
      signedStoragePublicId: saved.publicId,
      status: ContractStatus.SIGNED,
    },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "CONTRACT_SIGNED_UPLOADED",
    entityType: "PurchaseContract",
    entityId: contractId,
    metadata: { fileName: saved.fileName },
  });

  revalidatePath(`/sales/contracts/${contractId}`);
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
