import type { PrintableContractData } from "@/lib/contracts/pdf-service";
import { fullName } from "@/lib/utils";

type DepositLike = {
  label: string;
  amount: number;
  dueDate?: Date | string | null;
};

type ConditionLike = {
  title: string;
  description?: string | null;
  dueDate?: Date | string | null;
  party?: string | null;
};

type ChangeOrderLike = {
  title: string;
  amount: number;
};

type SoaItemLike = {
  category: string;
  name: string;
  location?: string | null;
  amount: number;
  notes?: string | null;
};

/** Contract row shape used when building the Sales Information Sheet PDF/HTML. */
export type ContractPdfSource = {
  contractNumber?: string | null;
  version: number;
  contractDate?: Date | string | null;
  effectiveDate?: Date | string | null;
  targetClosing?: Date | string | null;
  firmPossessionDate?: Date | string | null;
  builderSignatureDate?: Date | string | null;
  purchaserAgreementReceiptDate?: Date | string | null;
  builderName?: string | null;
  buyerFirstName?: string | null;
  buyerLastName?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  buyerMailing?: string | null;
  buyerOccupation?: string | null;
  buyerIdNumber?: string | null;
  buyer2FirstName?: string | null;
  buyer2LastName?: string | null;
  buyer2Email?: string | null;
  buyer2Phone?: string | null;
  buyer2Mailing?: string | null;
  buyer2Occupation?: string | null;
  buyer2IdNumber?: string | null;
  projectName?: string | null;
  municipalAddress?: string | null;
  legalAddress?: string | null;
  lotBlockPlan?: string | null;
  city?: string | null;
  block?: string | null;
  lot?: string | null;
  plan?: string | null;
  realtorName?: string | null;
  realtorPhone?: string | null;
  realtorEmail?: string | null;
  lawyerName?: string | null;
  lawyerPhone?: string | null;
  lawyerEmail?: string | null;
  basePrice?: number | null;
  allowanceTotal?: number | null;
  upgradesTotal?: number | null;
  discountsTotal?: number | null;
  gstRebate?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  totalContractPrice?: number | null;
  purchasePrice?: number | null;
  changeOrderNotes?: string | null;
  scopeSummary?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  specialConditions?: string | null;
  clientTerms?: string | null;
  status: string;
  buyer?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    mailingAddress?: string | null;
  } | null;
  company?: { city?: string | null } | null;
  deposits?: DepositLike[];
  conditions?: ConditionLike[];
  project?: { changeOrders?: ChangeOrderLike[] } | null;
  scheduleOfAllowances?: { items?: SoaItemLike[] } | null;
};

/**
 * Maps a purchase contract (+ relations) onto PrintableContractData
 * so every Sales Information Sheet heading can be filled.
 */
export function mapContractToPrintableData(
  contract: ContractPdfSource
): PrintableContractData {
  const buyerName =
    fullName(contract.buyer?.firstName, contract.buyer?.lastName) ||
    fullName(contract.buyerFirstName, contract.buyerLastName) ||
    "Client";
  const buyer2Name =
    fullName(contract.buyer2FirstName, contract.buyer2LastName) || null;

  const changeOrdersFromProject = (contract.project?.changeOrders || []).map(
    (co) => ({
      title: co.title,
      amount: co.amount,
    })
  );
  const changeOrders =
    changeOrdersFromProject.length > 0
      ? changeOrdersFromProject
      : contract.changeOrderNotes
        ? [{ title: contract.changeOrderNotes, amount: 0 }]
        : [];

  const depositOrder = [
    "On Signing",
    "On removal of condition",
    "By Date 1",
    "By Date 2",
    "By Date 3",
  ];
  const depositsSorted = [...(contract.deposits || [])].sort((a, b) => {
    const ai = depositOrder.indexOf(a.label);
    const bi = depositOrder.indexOf(b.label);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return {
    contractNumber: contract.contractNumber || "PC-DRAFT",
    version: contract.version,
    contractDate: contract.contractDate,
    effectiveDate: contract.effectiveDate,
    targetClosing: contract.targetClosing,
    firmPossessionDate:
      contract.firmPossessionDate || contract.targetClosing || null,
    builderSignatureDate: contract.builderSignatureDate,
    purchaserAgreementReceiptDate:
      contract.purchaserAgreementReceiptDate || contract.effectiveDate || null,
    builderName: contract.builderName || "Sunview Custom Homes",
    buyerName,
    buyerEmail: contract.buyerEmail || contract.buyer?.email,
    buyerPhone: contract.buyerPhone || contract.buyer?.phone,
    buyerAddress: contract.buyerMailing || contract.buyer?.mailingAddress,
    buyerOccupation: contract.buyerOccupation,
    buyerIdNumber: contract.buyerIdNumber,
    buyer2Name,
    buyer2Email: contract.buyer2Email,
    buyer2Phone: contract.buyer2Phone,
    buyer2Address: contract.buyer2Mailing,
    buyer2Occupation: contract.buyer2Occupation,
    buyer2IdNumber: contract.buyer2IdNumber,
    projectName: contract.projectName,
    municipalAddress: contract.municipalAddress,
    legalAddress: contract.legalAddress,
    lotBlockPlan: contract.lotBlockPlan,
    city: contract.city || contract.company?.city || null,
    block: contract.block,
    lot: contract.lot,
    plan: contract.plan,
    realtorName: contract.realtorName,
    realtorPhone: contract.realtorPhone,
    realtorEmail: contract.realtorEmail,
    lawyerName: contract.lawyerName,
    lawyerPhone: contract.lawyerPhone,
    lawyerEmail: contract.lawyerEmail,
    basePrice: contract.basePrice ?? 0,
    allowanceTotal: contract.allowanceTotal ?? 0,
    upgradesTotal: contract.upgradesTotal ?? 0,
    discountsTotal: contract.discountsTotal ?? 0,
    subtotal:
      (contract.basePrice ?? 0) +
      (contract.allowanceTotal ?? 0) +
      (contract.upgradesTotal ?? 0),
    taxRate: contract.taxRate ?? 5.0,
    taxAmount: contract.taxAmount ?? 0,
    gstRebate: contract.gstRebate ?? contract.discountsTotal ?? 0,
    totalContractPrice:
      contract.totalContractPrice ?? contract.purchasePrice ?? 0,
    deposits: depositsSorted.map((d) => ({
      label: d.label,
      amount: d.amount,
      dueDate: d.dueDate,
    })),
    conditions: (contract.conditions || []).map((c) => ({
      title: c.title,
      description: c.description,
      dueDate: c.dueDate,
      party:
        c.party ||
        (/builder/i.test(c.title) ? "builder" : "purchaser"),
    })),
    changeOrders,
    changeOrderNotes: contract.changeOrderNotes,
    scopeSummary: contract.scopeSummary,
    inclusions: contract.inclusions,
    exclusions: contract.exclusions,
    specialConditions: contract.specialConditions,
    clientTerms: contract.clientTerms,
    status: contract.status,
    soaItems: (contract.scheduleOfAllowances?.items || []).map((i) => ({
      category: i.category,
      name: i.name,
      location: i.location,
      amount: i.amount,
      notes: i.notes,
    })),
  };
}

/** Canonical deposit slot labels matching the fillable SV Purchase Agreement. */
export const SALES_SHEET_DEPOSIT_LABELS = [
  "On Signing",
  "On removal of condition",
  "By Date 1",
  "By Date 2",
  "By Date 3",
] as const;
