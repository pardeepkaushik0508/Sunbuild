"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AllowanceItemStatus, ContractStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { ACTION_RATE, assertRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { calculateContractTotals, calculateSoaTotals, roundMoney } from "@/lib/contracts/contracts";

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

async function rateLimit(userId: string, kind: string) {
  const h = await headers();
  assertRateLimit(
    clientKeyFromHeaders(h, `${kind}:${userId}`),
    ACTION_RATE.limit,
    ACTION_RATE.windowMs
  );
}

/**
 * Recalculates SOA totals and propagates changes to the parent PurchaseContract.
 */
async function syncSoaAndContractTotals(soaId: string, tx: any = prisma) {
  const soa = await tx.scheduleOfAllowances.findUnique({
    where: { id: soaId },
    include: {
      items: true,
      contract: true,
    },
  });

  if (!soa) return;

  const soaTotals = calculateSoaTotals(soa.items);

  await tx.scheduleOfAllowances.update({
    where: { id: soaId },
    data: {
      totalAllowance: soaTotals.totalAllowance,
      committedAmount: soaTotals.committedAmount,
      remainingAmount: soaTotals.remainingAmount,
      overageAmount: soaTotals.overageAmount,
    },
  });

  if (soa.contract && soa.contract.status !== ContractStatus.EXECUTED) {
    const contractTotals = calculateContractTotals({
      basePrice: soa.contract.basePrice,
      allowanceTotal: soaTotals.totalAllowance,
      upgradesTotal: soa.contract.upgradesTotal,
      discountsTotal: soa.contract.discountsTotal,
      taxRate: soa.contract.taxRate,
    });

    await tx.purchaseContract.update({
      where: { id: soa.contract.id },
      data: {
        allowanceTotal: contractTotals.allowanceTotal,
        taxAmount: contractTotals.taxAmount,
        totalContractPrice: contractTotals.totalContractPrice,
        purchasePrice: contractTotals.totalContractPrice,
      },
    });
  }
}

/**
 * Adds an allowance item to a Schedule of Allowances.
 */
export async function addAllowanceItemAction(soaId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "soa-item-add");

  const soa = await prisma.scheduleOfAllowances.findUnique({
    where: { id: soaId },
    include: { contract: { select: { status: true } } },
  });

  if (!soa) throw new AppError("Schedule of Allowances not found");
  if (soa.status === "LOCKED" || soa.contract?.status === ContractStatus.EXECUTED) {
    throw new AppError("Executed Schedule of Allowances is locked and cannot be modified.");
  }

  const category = formString(form, "category") || "General";
  const name = formString(form, "name");
  if (!name) throw new AppError("Item name is required");

  const amount = formFloat(form, "amount") ?? 0;
  const description = formString(form, "description") || null;
  const location = formString(form, "location") || null;
  const quantity = formFloat(form, "quantity");
  const unit = formString(form, "unit") || null;
  const costCode = formString(form, "costCode") || null;
  const selectionRequired = formString(form, "selectionRequired") !== "0";
  const displayToClient = formString(form, "displayToClient") !== "0";
  const notes = formString(form, "notes") || null;

  const dueRaw = formString(form, "selectionDueDate");
  const selectionDueDate = dueRaw ? new Date(dueRaw) : null;

  const maxSort = await prisma.allowanceItem.aggregate({
    where: { soaId },
    _max: { sortOrder: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.allowanceItem.create({
      data: {
        soaId,
        category,
        name,
        description,
        location,
        quantity,
        unit,
        amount,
        costCode,
        selectionRequired,
        selectionDueDate,
        notes,
        displayToClient,
        status: AllowanceItemStatus.PENDING_SELECTION,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    await syncSoaAndContractTotals(soaId, tx);
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "SOA_ITEM_ADDED",
    entityType: "ScheduleOfAllowances",
    entityId: soaId,
    metadata: JSON.stringify({ category, name, amount }),
  });

  revalidatePath(`/sales/soa/${soaId}`);
  revalidatePath(`/sales/contracts/${soa.contractId}`);
}

/**
 * Updates an allowance item in the SOA.
 */
export async function updateAllowanceItemAction(itemId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "soa-item-update");

  const item = await prisma.allowanceItem.findUnique({
    where: { id: itemId },
    include: { soa: { include: { contract: { select: { status: true } } } } },
  });

  if (!item) throw new AppError("Allowance item not found");
  if (item.soa.status === "LOCKED" || item.soa.contract?.status === ContractStatus.EXECUTED) {
    throw new AppError("Executed Schedule of Allowances is locked and cannot be modified.");
  }

  const category = formString(form, "category") || item.category;
  const name = formString(form, "name") || item.name;
  const amount = formFloat(form, "amount") ?? item.amount;
  const description = formString(form, "description") || null;
  const location = formString(form, "location") || null;
  const quantity = formFloat(form, "quantity");
  const unit = formString(form, "unit") || null;
  const costCode = formString(form, "costCode") || null;
  const selectionRequired = formString(form, "selectionRequired") !== "0";
  const displayToClient = formString(form, "displayToClient") !== "0";
  const notes = formString(form, "notes") || null;

  const dueRaw = formString(form, "selectionDueDate");
  const selectionDueDate = dueRaw ? new Date(dueRaw) : null;

  await prisma.$transaction(async (tx) => {
    await tx.allowanceItem.update({
      where: { id: itemId },
      data: {
        category,
        name,
        amount,
        description,
        location,
        quantity,
        unit,
        costCode,
        selectionRequired,
        selectionDueDate,
        displayToClient,
        notes,
      },
    });

    await syncSoaAndContractTotals(item.soaId, tx);
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "SOA_ITEM_UPDATED",
    entityType: "AllowanceItem",
    entityId: itemId,
  });

  revalidatePath(`/sales/soa/${item.soaId}`);
  revalidatePath(`/sales/contracts/${item.soa.contractId}`);
}

/**
 * Deletes an allowance item from the SOA.
 */
export async function deleteAllowanceItemAction(itemId: string) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "soa-item-delete");

  const item = await prisma.allowanceItem.findUnique({
    where: { id: itemId },
    include: { soa: { include: { contract: { select: { status: true } } } } },
  });

  if (!item) throw new AppError("Allowance item not found");
  if (item.soa.status === "LOCKED" || item.soa.contract?.status === ContractStatus.EXECUTED) {
    throw new AppError("Executed Schedule of Allowances is locked and cannot be modified.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.allowanceItem.delete({
      where: { id: itemId },
    });

    await syncSoaAndContractTotals(item.soaId, tx);
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "SOA_ITEM_DELETED",
    entityType: "AllowanceItem",
    entityId: itemId,
  });

  revalidatePath(`/sales/soa/${item.soaId}`);
  revalidatePath(`/sales/contracts/${item.soa.contractId}`);
}

/**
 * 1-click human-confirmed application of an AI suggestion to an allowance item or category.
 */
export async function applySoaRecommendationAction(
  soaId: string,
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimit(session.user.id, "soa-rec-apply");

  const itemId = formString(form, "itemId");
  const actionType = formString(form, "actionType");
  const suggestedValue = formString(form, "suggestedValue");

  if (actionType === "CATEGORY_SUGGESTION" && itemId && suggestedValue) {
    await prisma.allowanceItem.update({
      where: { id: itemId },
      data: { category: suggestedValue },
    });
  } else if (actionType === "ADD_ESSENTIAL" && suggestedValue) {
    const maxSort = await prisma.allowanceItem.aggregate({
      where: { soaId },
      _max: { sortOrder: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.allowanceItem.create({
        data: {
          soaId,
          category: suggestedValue,
          name: `${suggestedValue} Allowance`,
          amount: 5000,
          selectionRequired: true,
          status: AllowanceItemStatus.PENDING_SELECTION,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
      await syncSoaAndContractTotals(soaId, tx);
    });
  }

  revalidatePath(`/sales/soa/${soaId}`);
}
