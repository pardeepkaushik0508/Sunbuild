import { prisma } from "@/lib/db";
import {
  ContractStatus,
  ProjectStatus,
  Role,
  SelectionPackageStatus,
  SelectionSectionStatus,
  AllowanceItemStatus,
  Prisma,
} from "@prisma/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";

/**
 * Currency rounding helper — strictly avoids floating point arithmetic drift.
 */
export function roundMoney(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Generates human-readable collision-safe contract numbers (e.g. PC-2026-0001).
 */
export async function generateContractNumber(
  companyId: string,
  client: Prisma.TransactionClient = prisma
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `PC-${currentYear}-`;

  const latest = await client.purchaseContract.findFirst({
    where: {
      contractNumber: { startsWith: prefix },
    },
    select: { contractNumber: true },
    orderBy: { contractNumber: "desc" },
  });

  let nextSequence = 1;
  if (latest?.contractNumber) {
    const parts = latest.contractNumber.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(num)) {
      nextSequence = num + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

/**
 * Generates human-readable collision-safe SOA numbers (e.g. SOA-2026-0001).
 */
export async function generateSoaNumber(
  companyId: string,
  client: Prisma.TransactionClient = prisma
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `SOA-${currentYear}-`;

  const latest = await client.scheduleOfAllowances.findFirst({
    where: {
      soaNumber: { startsWith: prefix },
    },
    select: { soaNumber: true },
    orderBy: { soaNumber: "desc" },
  });

  let nextSequence = 1;
  if (latest?.soaNumber) {
    const parts = latest.soaNumber.split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(num)) {
      nextSequence = num + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

export type ContractFinancialInputs = {
  basePrice?: number | null;
  allowanceTotal?: number | null;
  upgradesTotal?: number | null;
  discountsTotal?: number | null;
  taxRate?: number | null;
};

export type ContractFinancialSummary = {
  basePrice: number;
  allowanceTotal: number;
  upgradesTotal: number;
  discountsTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalContractPrice: number;
};

/**
 * Authoritative server-side contract total calculations.
 * Formula:
 * Subtotal = Base Contract Price + Original Allowances + Approved Upgrades - Discounts
 * Total = Subtotal + (Subtotal * TaxRate / 100)
 */
export function calculateContractTotals(
  input: ContractFinancialInputs
): ContractFinancialSummary {
  const basePrice = roundMoney(input.basePrice ?? 0);
  const allowanceTotal = roundMoney(input.allowanceTotal ?? 0);
  const upgradesTotal = roundMoney(input.upgradesTotal ?? 0);
  const discountsTotal = roundMoney(input.discountsTotal ?? 0);

  const subtotal = roundMoney(
    basePrice + allowanceTotal + upgradesTotal - discountsTotal
  );
  const taxRate = input.taxRate != null && input.taxRate >= 0 ? input.taxRate : 5.0; // 5% Alberta GST default
  const taxAmount = roundMoney((subtotal * taxRate) / 100);
  const totalContractPrice = roundMoney(subtotal + taxAmount);

  return {
    basePrice,
    allowanceTotal,
    upgradesTotal,
    discountsTotal,
    subtotal,
    taxRate,
    taxAmount,
    totalContractPrice,
  };
}

export type AllowanceRow = {
  id?: string;
  amount?: number | null;
  selectedCost?: number | null;
  status?: AllowanceItemStatus | string;
};

export type SoaTotalsSummary = {
  totalAllowance: number;
  committedAmount: number;
  remainingAmount: number;
  overageAmount: number;
  underAllowance: number;
  percentUsed: number;
};

/**
 * Authoritative server-side Schedule of Allowances calculations.
 */
export function calculateSoaTotals(items: AllowanceRow[]): SoaTotalsSummary {
  let totalAllowance = 0;
  let committedAmount = 0;

  for (const item of items) {
    totalAllowance += roundMoney(item.amount ?? 0);
    committedAmount += roundMoney(item.selectedCost ?? 0);
  }

  totalAllowance = roundMoney(totalAllowance);
  committedAmount = roundMoney(committedAmount);

  const remainingAmount = roundMoney(
    Math.max(0, totalAllowance - committedAmount)
  );
  const overageAmount = roundMoney(
    Math.max(0, committedAmount - totalAllowance)
  );
  const underAllowance = roundMoney(
    Math.max(0, totalAllowance - committedAmount)
  );
  const percentUsed =
    totalAllowance > 0
      ? Math.min(100, Math.round((committedAmount / totalAllowance) * 100))
      : committedAmount > 0
        ? 100
        : 0;

  return {
    totalAllowance,
    committedAmount,
    remainingAmount,
    overageAmount,
    underAllowance,
    percentUsed,
  };
}

/**
 * Standard fixed allowance categories for custom home construction (Buildertrend-inspired).
 */
export const STANDARD_ALLOWANCE_CATEGORIES = [
  "Flooring",
  "Kitchen Cabinetry",
  "Bathrooms & Laundry Cabinetry",
  "Countertops",
  "Plumbing Fixtures",
  "Lighting Fixtures",
  "Appliances",
  "Tile & Backsplash",
  "Fireplace & Feature Walls",
  "Finishing Carpentry & Hardware",
  "Window Coverings",
  "Paint & Specialty Finishes",
  "Landscaping & Exterior",
] as const;

/**
 * Executes a Purchase Contract with full transaction safety, locking snapshots,
 * activating the project, and synchronizing the project's Selection Package from SOA.
 */
export async function executeContractTransaction(opts: {
  contractId: string;
  userId: string;
  companyId: string;
  pmId?: string | null;
}) {
  const { contractId, userId, companyId, pmId } = opts;

  return prisma.$transaction(async (tx) => {
    const contract = await tx.purchaseContract.findUnique({
      where: { id: contractId },
      include: {
        scheduleOfAllowances: {
          include: {
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        project: true,
        buyer: true,
      },
    });

    if (!contract) throw new AppError("Contract not found");
    if (contract.status === ContractStatus.EXECUTED) {
      throw new AppError("Contract is already executed and locked");
    }

    // Generate immutable snapshots
    const executedSnapshot = {
      contractNumber: contract.contractNumber,
      version: contract.version,
      contractDate: contract.contractDate,
      effectiveDate: contract.effectiveDate ?? new Date(),
      basePrice: contract.basePrice,
      allowanceTotal: contract.allowanceTotal,
      upgradesTotal: contract.upgradesTotal,
      discountsTotal: contract.discountsTotal,
      taxRate: contract.taxRate,
      taxAmount: contract.taxAmount,
      totalContractPrice: contract.totalContractPrice,
      purchasePrice: contract.purchasePrice ?? contract.totalContractPrice,
      projectName: contract.projectName,
      municipalAddress: contract.municipalAddress,
      legalAddress: contract.legalAddress,
      lotBlockPlan: contract.lotBlockPlan,
      buyerFirstName: contract.buyerFirstName,
      buyerLastName: contract.buyerLastName,
      buyerEmail: contract.buyerEmail,
      buyerPhone: contract.buyerPhone,
      buyerMailing: contract.buyerMailing,
      builderName: contract.builderName,
      scopeSummary: contract.scopeSummary,
      inclusions: contract.inclusions,
      exclusions: contract.exclusions,
      specialConditions: contract.specialConditions,
      clientTerms: contract.clientTerms,
      executedAt: new Date().toISOString(),
      executedByUserId: userId,
    };

    const soaItems = contract.scheduleOfAllowances?.items ?? [];
    const executedSoaSnapshot = {
      soaNumber: contract.scheduleOfAllowances?.soaNumber,
      version: contract.scheduleOfAllowances?.version ?? 1,
      totalAllowance: contract.scheduleOfAllowances?.totalAllowance ?? 0,
      items: soaItems.map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        description: item.description,
        location: item.location,
        quantity: item.quantity,
        unit: item.unit,
        amount: item.amount,
        selectionRequired: item.selectionRequired,
        selectionDueDate: item.selectionDueDate,
        displayToClient: item.displayToClient,
      })),
      executedAt: new Date().toISOString(),
    };

    // Ensure Buyer exists
    let buyerId = contract.buyerId;
    if (!buyerId && contract.buyerFirstName && contract.buyerLastName) {
      const buyer = await tx.buyer.create({
        data: {
          firstName: contract.buyerFirstName,
          lastName: contract.buyerLastName,
          email: contract.buyerEmail,
          phone: contract.buyerPhone,
          mailingAddress: contract.buyerMailing,
        },
      });
      buyerId = buyer.id;
    }

    // Ensure Project exists or is activated
    let projectId = contract.projectId;
    if (!projectId) {
      const project = await tx.project.create({
        data: {
          companyId,
          name:
            contract.projectName ||
            `${contract.buyerLastName || "Custom"} Residence`,
          municipalAddress: contract.municipalAddress,
          legalAddress: contract.legalAddress,
          lotInfo: contract.lotBlockPlan,
          purchasePrice:
            contract.totalContractPrice ?? contract.purchasePrice ?? 0,
          contractDate: contract.contractDate ?? new Date(),
          targetClosing: contract.targetClosing,
          buyerId,
          pmId: pmId || undefined,
          status: ProjectStatus.PRE_CONSTRUCTION,
        },
      });
      projectId = project.id;
    } else {
      await tx.project.update({
        where: { id: projectId },
        data: {
          name: contract.projectName || undefined,
          municipalAddress: contract.municipalAddress,
          legalAddress: contract.legalAddress,
          lotInfo: contract.lotBlockPlan,
          purchasePrice:
            contract.totalContractPrice ?? contract.purchasePrice ?? undefined,
          contractDate: contract.contractDate ?? undefined,
          targetClosing: contract.targetClosing ?? undefined,
          buyerId: buyerId || undefined,
          pmId: pmId || undefined,
        },
      });
    }

    // Grant PM ProjectAccess if assigned
    if (pmId) {
      await tx.projectAccess.upsert({
        where: { projectId_userId: { projectId, userId: pmId } },
        update: { role: Role.PROJECT_MANAGER },
        create: {
          projectId,
          userId: pmId,
          role: Role.PROJECT_MANAGER,
        },
      });
    }

    // Update PurchaseContract status to EXECUTED and lock snapshots
    const executedContract = await tx.purchaseContract.update({
      where: { id: contractId },
      data: {
        status: ContractStatus.EXECUTED,
        executedAt: new Date(),
        executedSnapshot,
        executedSoaSnapshot,
        projectId,
        buyerId,
        companyId,
      },
    });

    // Update ScheduleOfAllowances status to LOCKED and attach to project
    if (contract.scheduleOfAllowances) {
      await tx.scheduleOfAllowances.update({
        where: { id: contract.scheduleOfAllowances.id },
        data: {
          status: "LOCKED",
          projectId,
          buyerId,
          companyId,
          executedSnapshot: executedSoaSnapshot,
        },
      });

      // Synchronize / Initialize Project SelectionPackage from SOA allowances
      // DO NOT duplicate data — SelectionPackage sections represent these allowances
      let pkg = await tx.selectionPackage.findFirst({
        where: { projectId },
      });

      if (!pkg) {
        pkg = await tx.selectionPackage.create({
          data: {
            projectId,
            soaId: contract.scheduleOfAllowances.id,
            title: "Home Selections",
            status: SelectionPackageStatus.OPEN,
          },
        });
      } else if (!pkg.soaId) {
        await tx.selectionPackage.update({
          where: { id: pkg.id },
          data: { soaId: contract.scheduleOfAllowances.id },
        });
      }

      // Group allowance items by category to support single or shared allowances
      const existingSections = await tx.selectionSection.findMany({
        where: { packageId: pkg.id },
      });
      const sectionByName = new Map(
        existingSections.map((s) => [s.name.toLowerCase().trim(), s])
      );

      for (let i = 0; i < soaItems.length; i++) {
        const item = soaItems[i];
        const catKey = item.category.toLowerCase().trim();
        let section = sectionByName.get(catKey);

        if (!section) {
          section = await tx.selectionSection.create({
            data: {
              packageId: pkg.id,
              name: item.category,
              allowanceItemId: item.id,
              allowance: item.amount,
              notes: item.description,
              dueDate: item.selectionDueDate,
              sortOrder: i + 1,
              status: SelectionSectionStatus.DRAFT,
              items: {
                create: [
                  {
                    label: item.name || "Primary selection",
                    notes: item.description,
                    allowanceAmount: item.amount,
                    sortOrder: 1,
                  },
                ],
              },
            },
          });
          sectionByName.set(catKey, section);
        } else {
          // If section already exists (e.g. shared allowance category), update allowance and link
          await tx.selectionSection.update({
            where: { id: section.id },
            data: {
              allowance: (section.allowance ?? 0) + item.amount,
              allowanceItemId: item.id,
              dueDate: item.selectionDueDate || section.dueDate,
            },
          });
        }

        // Link AllowanceItem back to SelectionSection
        await tx.allowanceItem.update({
          where: { id: item.id },
          data: {
            selectionSectionId: section.id,
          },
        });
      }
    }

    await writeAudit({
      userId,
      companyId,
      projectId,
      action: "CONTRACT_EXECUTED",
      entityType: "PurchaseContract",
      entityId: contractId,
      metadata: JSON.stringify({
        contractNumber: contract.contractNumber,
        totalContractPrice: contract.totalContractPrice,
        projectId,
      }),
    });

    return {
      contract: executedContract,
      projectId,
    };
  });
}
