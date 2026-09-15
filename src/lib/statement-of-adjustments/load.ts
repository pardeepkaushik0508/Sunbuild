import {
  ContractStatus,
  StatementOfAdjustmentsStatus,
  type StatementOfAdjustments,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/utils";
import {
  calculateStatementOfAdjustments,
  type SoaCalculationResult,
} from "./calculate";
import {
  resolveCompanyLegalInfo,
  type CompanyLegalInfo,
} from "./company-legal";

const EXECUTED_PREFERENCE: ContractStatus[] = [
  ContractStatus.EXECUTED,
  ContractStatus.SIGNED,
  ContractStatus.CONFIRMED,
  ContractStatus.SENT_TO_CLIENT,
  ContractStatus.READY_FOR_REVIEW,
  ContractStatus.IN_REVIEW,
  ContractStatus.UPLOADED,
  ContractStatus.DRAFT,
];

export type SoaPartyInfo = {
  municipalAddress: string | null;
  buyerName: string | null;
  phone: string | null;
  email: string | null;
  statementDate: Date;
  contractNumber: string | null;
  legalDescription: string | null;
  possessionDate: Date | null;
};

export type SoaValidationIssue = {
  code: string;
  message: string;
};

export type LoadedStatementOfAdjustments = {
  record: StatementOfAdjustments | null;
  projectId: string;
  projectName: string;
  companyId: string;
  companyLegal: CompanyLegalInfo;
  party: SoaPartyInfo;
  contractId: string | null;
  calculations: SoaCalculationResult;
  issues: SoaValidationIssue[];
  canGeneratePdf: boolean;
};

function pickContract<T extends { status: ContractStatus; createdAt: Date }>(
  contracts: T[]
): T | null {
  if (contracts.length === 0) return null;
  for (const status of EXECUTED_PREFERENCE) {
    const match = contracts
      .filter((c) => c.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (match) return match;
  }
  return [...contracts].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];
}

export function validateSoaReady(input: {
  party: SoaPartyInfo;
  baseHomePrice: number;
  contractId: string | null;
}): SoaValidationIssue[] {
  const issues: SoaValidationIssue[] = [];
  if (!input.party.buyerName?.trim()) {
    issues.push({ code: "BUYER", message: "Buyer name is missing." });
  }
  if (!input.party.municipalAddress?.trim()) {
    issues.push({
      code: "ADDRESS",
      message: "Municipal address is missing.",
    });
  }
  if (!input.contractId) {
    issues.push({
      code: "CONTRACT",
      message: "Purchase Contract is missing for this project.",
    });
  } else if (!input.party.contractNumber?.trim()) {
    issues.push({
      code: "CONTRACT_NUMBER",
      message: "Contract number is missing.",
    });
  }
  if (!(input.baseHomePrice > 0)) {
    issues.push({
      code: "BASE_PRICE",
      message: "Base home price is missing or zero on the Purchase Contract.",
    });
  }
  return issues;
}

/**
 * Load live (or finalized snapshot) Statement of Adjustments for a project.
 * Creates a DRAFT record on first access when `ensureDraft` is true.
 */
export async function loadStatementOfAdjustmentsForProject(opts: {
  projectId: string;
  companyId: string;
  ensureDraft?: boolean;
  userId?: string;
  statementId?: string;
}): Promise<LoadedStatementOfAdjustments> {
  const project = await prisma.project.findFirst({
    where: { id: opts.projectId, companyId: opts.companyId },
    include: {
      buyer: true,
      company: true,
      contracts: { orderBy: { createdAt: "desc" } },
      changeOrders: { orderBy: { createdAt: "asc" } },
      deposits: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      statementsOfAdjustments: {
        orderBy: { version: "desc" },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  let record =
    (opts.statementId
      ? project.statementsOfAdjustments.find((s) => s.id === opts.statementId)
      : null) ??
    project.statementsOfAdjustments.find(
      (s) => s.status === StatementOfAdjustmentsStatus.DRAFT
    ) ??
    project.statementsOfAdjustments[0] ??
    null;

  const contract = pickContract(project.contracts);

  if (opts.ensureDraft && !record) {
    const version = 1;
    const statementNumber = await nextStatementNumber(
      opts.companyId,
      contract?.contractNumber
    );
    record = await prisma.statementOfAdjustments.create({
      data: {
        companyId: opts.companyId,
        projectId: project.id,
        purchaseContractId: contract?.id ?? null,
        statementNumber,
        version,
        statementDate: new Date(),
        status: StatementOfAdjustmentsStatus.DRAFT,
        promoCreditAdjustment: contract?.discountsTotal ?? 0,
        generatedById: opts.userId ?? null,
      },
    });
  } else if (
    record &&
    record.status === StatementOfAdjustmentsStatus.DRAFT &&
    contract &&
    record.purchaseContractId !== contract.id
  ) {
    record = await prisma.statementOfAdjustments.update({
      where: { id: record.id },
      data: { purchaseContractId: contract.id },
    });
  }

  const buyerName =
    (project.buyer &&
      fullName(project.buyer.firstName, project.buyer.lastName)) ||
    (contract &&
      fullName(contract.buyerFirstName, contract.buyerLastName)) ||
    null;

  const party: SoaPartyInfo = {
    municipalAddress:
      project.municipalAddress || contract?.municipalAddress || null,
    buyerName,
    phone: project.buyer?.phone || contract?.buyerPhone || null,
    email: project.buyer?.email || contract?.buyerEmail || null,
    statementDate: record?.statementDate ?? new Date(),
    contractNumber: contract?.contractNumber || null,
    legalDescription:
      project.legalAddress ||
      contract?.legalAddress ||
      contract?.lotBlockPlan ||
      project.lotInfo ||
      null,
    possessionDate:
      contract?.targetClosing || project.targetClosing || null,
  };

  const baseHomePrice =
    contract?.basePrice ??
    contract?.purchasePrice ??
    project.purchasePrice ??
    0;

  // Sunview Statement of Adjustments client format includes GST 5% when enabled.
  const includeGst = record?.includeGst ?? true;
  const gstRate = includeGst ? 0.05 : 0;

  const promo =
    record?.status === StatementOfAdjustmentsStatus.FINALIZED &&
    record.financialSnapshot
      ? ((record.financialSnapshot as { promoCreditAdjustment?: number })
          .promoCreditAdjustment ?? record.promoCreditAdjustment)
      : (record?.promoCreditAdjustment ?? contract?.discountsTotal ?? 0);

  let calculations: SoaCalculationResult;

  if (
    record?.status === StatementOfAdjustmentsStatus.FINALIZED &&
    record.financialSnapshot &&
    typeof record.financialSnapshot === "object"
  ) {
    calculations = record.financialSnapshot as unknown as SoaCalculationResult;
    if (calculations.includeGst === undefined) {
      calculations = {
        ...calculations,
        includeGst: (calculations.totalGst ?? 0) > 0,
      };
    }
  } else {
    calculations = calculateStatementOfAdjustments({
      baseHomePrice,
      gstRate,
      includeGst,
      promoCreditAdjustment: promo,
      changeOrders: project.changeOrders.map((co) => ({
        id: co.id,
        title: co.title,
        amount: co.amount,
        status: co.status,
        createdAt: co.createdAt,
        clientActionAt: co.clientActionAt,
      })),
      deposits: project.deposits.map((d) => ({
        id: d.id,
        label: d.label,
        amount: d.amount,
        status: d.status,
        dueDate: d.dueDate,
        updatedAt: d.updatedAt,
      })),
    });
  }

  const issues = validateSoaReady({
    party,
    baseHomePrice: calculations.baseHomePrice,
    contractId: contract?.id ?? null,
  });

  return {
    record,
    projectId: project.id,
    projectName: project.name,
    companyId: project.companyId,
    companyLegal: resolveCompanyLegalInfo(project.company),
    party,
    contractId: contract?.id ?? null,
    calculations,
    issues,
    canGeneratePdf: issues.length === 0,
  };
}

async function nextStatementNumber(
  companyId: string,
  contractNumber?: string | null
) {
  const year = new Date().getFullYear();
  const count = await prisma.statementOfAdjustments.count({
    where: { companyId },
  });
  const seq = String(count + 1).padStart(4, "0");
  const contractBit = contractNumber?.replace(/[^\w-]/g, "") || `PC-${year}`;
  return `SOA-${contractBit}-${seq}`;
}

export async function nextStatementVersion(projectId: string) {
  const latest = await prisma.statementOfAdjustments.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}
