/**
 * Shared FormData parsing helpers for Sales Information Sheet contract fields.
 */
import type { Prisma } from "@prisma/client";
import { SALES_SHEET_DEPOSIT_LABELS } from "@/lib/contracts/printable-contract";
import { roundMoney } from "@/lib/contracts/contracts";

export function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function formFloat(form: FormData, key: string): number | null {
  const v = formString(form, key);
  if (!v) return null;
  const num = parseFloat(v);
  return Number.isNaN(num) ? null : roundMoney(num);
}

export function formDate(form: FormData, key: string): Date | null {
  const raw = formString(form, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Builds lotBlockPlan display string from separate Block / Lot / Plan inputs. */
export function composeLotBlockPlan(
  lot?: string | null,
  block?: string | null,
  plan?: string | null,
  fallback?: string | null
): string | null {
  const parts: string[] = [];
  if (lot) parts.push(`Lot ${lot}`);
  if (block) parts.push(`Block ${block}`);
  if (plan) parts.push(`Plan ${plan}`);
  if (parts.length) return parts.join(", ");
  return fallback || null;
}

/** All PurchaseContract columns that map 1:1 to the SV fillable Sales Information Sheet. */
export function parseSalesSheetContractFields(form: FormData) {
  const lot = formString(form, "lot") || null;
  const block = formString(form, "block") || null;
  const plan = formString(form, "plan") || null;
  const lotBlockPlanRaw = formString(form, "lotBlockPlan") || null;
  const lotBlockPlan = composeLotBlockPlan(lot, block, plan, lotBlockPlanRaw);

  const gstRebate =
    formFloat(form, "gstRebate") ?? formFloat(form, "discountsTotal") ?? 0;
  const discountsTotal = formFloat(form, "discountsTotal") ?? gstRebate;

  return {
    buyerFirstName: formString(form, "buyerFirstName") || null,
    buyerLastName: formString(form, "buyerLastName") || null,
    buyerEmail: formString(form, "buyerEmail") || null,
    buyerPhone: formString(form, "buyerPhone") || null,
    buyerMailing: formString(form, "buyerMailing") || null,
    buyerOccupation: formString(form, "buyerOccupation") || null,
    buyerIdNumber: formString(form, "buyerIdNumber") || null,
    buyer2FirstName: formString(form, "buyer2FirstName") || null,
    buyer2LastName: formString(form, "buyer2LastName") || null,
    buyer2Email: formString(form, "buyer2Email") || null,
    buyer2Phone: formString(form, "buyer2Phone") || null,
    buyer2Mailing: formString(form, "buyer2Mailing") || null,
    buyer2Occupation: formString(form, "buyer2Occupation") || null,
    buyer2IdNumber: formString(form, "buyer2IdNumber") || null,
    projectName: formString(form, "projectName") || null,
    municipalAddress: formString(form, "municipalAddress") || null,
    legalAddress: formString(form, "legalAddress") || null,
    lotBlockPlan,
    city: formString(form, "city") || null,
    block,
    lot,
    plan,
    builderName: formString(form, "builderName") || "Sunview Custom Homes",
    realtorName: formString(form, "realtorName") || null,
    realtorPhone: formString(form, "realtorPhone") || null,
    realtorEmail: formString(form, "realtorEmail") || null,
    lawyerName: formString(form, "lawyerName") || null,
    lawyerPhone: formString(form, "lawyerPhone") || null,
    lawyerEmail: formString(form, "lawyerEmail") || null,
    changeOrderNotes: formString(form, "changeOrderNotes") || null,
    contractDate: formDate(form, "contractDate") ?? new Date(),
    effectiveDate: formDate(form, "effectiveDate"),
    targetClosing:
      formDate(form, "firmPossessionDate") || formDate(form, "targetClosing"),
    firmPossessionDate:
      formDate(form, "firmPossessionDate") || formDate(form, "targetClosing"),
    builderSignatureDate: formDate(form, "builderSignatureDate"),
    purchaserAgreementReceiptDate:
      formDate(form, "purchaserAgreementReceiptDate") ||
      formDate(form, "effectiveDate"),
    gstRebate,
    discountsTotal,
    scopeSummary: formString(form, "scopeSummary") || null,
    inclusions: formString(form, "inclusions") || null,
    exclusions: formString(form, "exclusions") || null,
    specialConditions: formString(form, "specialConditions") || null,
    clientTerms: formString(form, "clientTerms") || null,
    internalNotes: formString(form, "internalNotes") || null,
    reviewNotes: formString(form, "reviewNotes") || null,
  };
}

export type ParsedDepositRow = {
  label: string;
  amount: number;
  dueDate: Date | null;
};

/** Reads On Signing / On removal / By Date 1–3 deposit slots from the form. */
export function parseSalesSheetDeposits(form: FormData): ParsedDepositRow[] {
  const rows: ParsedDepositRow[] = [
    {
      label: SALES_SHEET_DEPOSIT_LABELS[0],
      amount: formFloat(form, "depositOnSigning") ?? 0,
      dueDate: null,
    },
    {
      label: SALES_SHEET_DEPOSIT_LABELS[1],
      amount: formFloat(form, "depositOnConditionRemoval") ?? 0,
      dueDate: null,
    },
    {
      label: SALES_SHEET_DEPOSIT_LABELS[2],
      amount: formFloat(form, "depositByDate1Amount") ?? 0,
      dueDate: formDate(form, "depositByDate1"),
    },
    {
      label: SALES_SHEET_DEPOSIT_LABELS[3],
      amount: formFloat(form, "depositByDate2Amount") ?? 0,
      dueDate: formDate(form, "depositByDate2"),
    },
    {
      label: SALES_SHEET_DEPOSIT_LABELS[4],
      amount: formFloat(form, "depositByDate3Amount") ?? 0,
      dueDate: formDate(form, "depositByDate3"),
    },
  ];
  return rows.filter((r) => r.amount > 0 || r.dueDate);
}

export type ParsedConditionRow = {
  title: string;
  dueDate: Date | null;
  party: "purchaser" | "builder";
};

/** Reads Schedule E purchaser/builder conditions from the form. */
export function parseSalesSheetConditions(form: FormData): ParsedConditionRow[] {
  const purchaserDate = formDate(form, "purchaserConditionDate");
  const builderDate = formDate(form, "builderConditionDate");
  const rows: ParsedConditionRow[] = [];

  const p1 = formString(form, "purchaserCondition1");
  const p2 = formString(form, "purchaserCondition2");
  if (p1) rows.push({ title: p1, dueDate: purchaserDate, party: "purchaser" });
  if (p2) rows.push({ title: p2, dueDate: purchaserDate, party: "purchaser" });
  // Persist date-only row so PDF still shows Purchaser Condition Date when titles empty
  if (!p1 && !p2 && purchaserDate) {
    rows.push({
      title: "Purchaser condition",
      dueDate: purchaserDate,
      party: "purchaser",
    });
  }

  const b1 = formString(form, "builderCondition1");
  const b2 = formString(form, "builderCondition2");
  if (b1) rows.push({ title: b1, dueDate: builderDate, party: "builder" });
  if (b2) rows.push({ title: b2, dueDate: builderDate, party: "builder" });
  if (!b1 && !b2 && builderDate) {
    rows.push({
      title: "Builder condition",
      dueDate: builderDate,
      party: "builder",
    });
  }

  return rows;
}

export async function syncContractDepositsAndConditions(
  tx: Prisma.TransactionClient,
  contractId: string,
  projectId: string | null | undefined,
  form: FormData
) {
  const deposits = parseSalesSheetDeposits(form);
  const conditions = parseSalesSheetConditions(form);

  await tx.deposit.deleteMany({ where: { contractId } });
  await tx.condition.deleteMany({ where: { contractId } });

  if (deposits.length) {
    await tx.deposit.createMany({
      data: deposits.map((d) => ({
        contractId,
        projectId: projectId || null,
        label: d.label,
        amount: d.amount,
        dueDate: d.dueDate,
      })),
    });
  }

  if (conditions.length) {
    await tx.condition.createMany({
      data: conditions.map((c) => ({
        contractId,
        projectId: projectId || null,
        title: c.title,
        dueDate: c.dueDate,
        party: c.party,
      })),
    });
  }
}
