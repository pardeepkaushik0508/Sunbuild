import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatDate } from "@/lib/utils";
import type { CompanyLegalInfo } from "./company-legal";
import type { SoaCalculationResult } from "./calculate";
import type { SoaPartyInfo } from "./load";
import { formatSoaCurrency } from "./money";

export type PrintableStatementOfAdjustments = {
  companyLegal: CompanyLegalInfo;
  party: SoaPartyInfo;
  calculations: SoaCalculationResult;
  statementNumber: string;
  projectName: string;
};

function money(n: number, asCredit = false) {
  return formatSoaCurrency(n, { asCredit });
}

/**
 * Statement of Adjustments PDF — classic print layout matching Sunview reference.
 * Letter size, underline party fields, dynamic CO/deposit rows, black Cash to Close bar.
 */
export async function generateStatementOfAdjustmentsPdfBuffer(
  data: PrintableStatementOfAdjustments
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.35, 0.35, 0.35);
  const rule = rgb(0.15, 0.15, 0.15);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginL = 48;
  const marginR = 48;
  const contentW = pageWidth - marginL - marginR;
  const colGap = 28;
  const colW = (contentW - colGap) / 2;
  const rightColX = marginL + colW + colGap;
  const amountX = pageWidth - marginR;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 42;

  const ensureSpace = (needed: number) => {
    if (y - needed < 48) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 42;
      drawContinuationHeader();
    }
  };

  const drawContinuationHeader = () => {
    page.drawText(data.companyLegal.legalName, {
      x: marginL,
      y,
      size: 11,
      font: fontBold,
      color: ink,
    });
    page.drawText("Statement of Adjustments (continued)", {
      x: marginL,
      y: y - 14,
      size: 9,
      font: fontRegular,
      color: muted,
    });
    y -= 28;
    page.drawLine({
      start: { x: marginL, y },
      end: { x: amountX, y },
      thickness: 0.75,
      color: rule,
    });
    y -= 18;
  };

  const drawTextRight = (
    text: string,
    xRight: number,
    yPos: number,
    size: number,
    bold = false
  ) => {
    const font = bold ? fontBold : fontRegular;
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: xRight - w,
      y: yPos,
      size,
      font,
      color: ink,
    });
  };

  const drawUnderlineField = (
    label: string,
    value: string,
    x: number,
    width: number
  ) => {
    page.drawText(label, {
      x,
      y,
      size: 8,
      font: fontRegular,
      color: muted,
    });
    y -= 14;
    const display = value || " ";
    page.drawText(display.slice(0, 48), {
      x,
      y,
      size: 10,
      font: fontRegular,
      color: ink,
    });
    y -= 4;
    page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: 0.6,
      color: rule,
    });
  };

  const drawMoneyRow = (
    label: string,
    amount: string,
    opts?: { bold?: boolean; indent?: number; size?: number }
  ) => {
    ensureSpace(18);
    const size = opts?.size ?? 10;
    const font = opts?.bold ? fontBold : fontRegular;
    const indent = opts?.indent ?? 0;
    page.drawText(label, {
      x: marginL + indent,
      y,
      size,
      font,
      color: ink,
    });
    drawTextRight(amount, amountX, y, size, opts?.bold);
    y -= 16;
  };

  const drawSectionRule = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: marginL, y },
      end: { x: amountX, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 14;
  };

  // ── Header ──
  page.drawText(data.companyLegal.legalName, {
    x: marginL,
    y,
    size: 14,
    font: fontBold,
    color: ink,
  });
  y -= 14;
  page.drawText(data.companyLegal.addressLine1, {
    x: marginL,
    y,
    size: 9,
    font: fontRegular,
    color: muted,
  });
  y -= 12;
  if (data.companyLegal.addressLine2) {
    page.drawText(data.companyLegal.addressLine2, {
      x: marginL,
      y,
      size: 9,
      font: fontRegular,
      color: muted,
    });
    y -= 12;
  }
  if (
    data.companyLegal.cityLine &&
    data.companyLegal.cityLine !== data.companyLegal.addressLine1
  ) {
    page.drawText(data.companyLegal.cityLine, {
      x: marginL,
      y,
      size: 9,
      font: fontRegular,
      color: muted,
    });
    y -= 12;
  }
  page.drawText(data.companyLegal.gstNumber, {
    x: marginL,
    y,
    size: 9,
    font: fontRegular,
    color: muted,
  });

  y -= 28;
  const title = "Statement of Adjustments";
  const titleSize = 16;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (pageWidth - titleW) / 2,
    y,
    size: titleSize,
    font: fontBold,
    color: ink,
  });

  y -= 28;

  // ── Party fields (two columns) ──
  const leftYStart = y;
  let leftY = y;
  const saveY = y;

  const drawLeft = (label: string, value: string) => {
    y = leftY;
    drawUnderlineField(label, value, marginL, colW);
    leftY = y - 10;
  };
  drawLeft("Municipal Address", data.party.municipalAddress || "");
  drawLeft("Buyer Name", data.party.buyerName || "");
  drawLeft("Phone", data.party.phone || "");
  drawLeft("Email", data.party.email || "");

  y = saveY;
  let rightY = saveY;
  const drawRight = (label: string, value: string) => {
    y = rightY;
    drawUnderlineField(label, value, rightColX, colW);
    rightY = y - 10;
  };
  drawRight("Date", formatDate(data.party.statementDate) || "");
  drawRight("Contract #", data.party.contractNumber || "");
  drawRight("Legal Description", data.party.legalDescription || "");
  drawRight(
    "Possession Date",
    formatDate(data.party.possessionDate) || ""
  );

  y = Math.min(leftY, rightY) - 8;
  drawSectionRule();

  // ── Financial body ──
  const calc = data.calculations;

  drawMoneyRow(
    "Base Home Price (Including Lot Cost)",
    money(calc.baseHomePrice)
  );
  drawMoneyRow("Subtotal", money(calc.subtotal), { bold: true });
  y -= 4;

  page.drawText("Approved Change Orders", {
    x: marginL,
    y,
    size: 10,
    font: fontBold,
    color: ink,
  });
  y -= 16;

  if (calc.changeOrders.length === 0) {
    page.drawText("None", {
      x: marginL + 12,
      y,
      size: 10,
      font: fontRegular,
      color: muted,
    });
    y -= 16;
  } else {
    for (const co of calc.changeOrders) {
      drawMoneyRow(co.label, money(co.amount), { indent: 12 });
    }
  }

  drawMoneyRow(
    "Change Orders Subtotal",
    money(calc.changeOrdersSubtotal),
    { bold: true }
  );
  drawMoneyRow(
    "Allowance (Promo credit towards Change Orders)",
    money(calc.promoCreditAdjustment, true)
  );
  drawMoneyRow(
    "Change Orders Total (Without GST)",
    money(calc.changeOrdersTotalWithoutGst),
    { bold: true }
  );
  y -= 4;
  drawMoneyRow("TOTAL CLOSING PRICE", money(calc.totalClosingPrice), {
    bold: true,
  });
  drawMoneyRow(
    `GST ${calc.gstRatePercent}%`,
    money(calc.totalGst)
  );
  drawMoneyRow("Total GST", money(calc.totalGst), { bold: true });
  drawMoneyRow("TOTAL SALES PRICE", money(calc.totalSalesPrice), {
    bold: true,
  });
  y -= 6;

  page.drawText("Deposits", {
    x: marginL,
    y,
    size: 10,
    font: fontBold,
    color: ink,
  });
  y -= 16;

  if (calc.deposits.length === 0) {
    page.drawText("None", {
      x: marginL + 12,
      y,
      size: 10,
      font: fontRegular,
      color: muted,
    });
    y -= 16;
  } else {
    for (const dep of calc.deposits) {
      drawMoneyRow(dep.label, money(dep.amount), { indent: 12 });
    }
  }

  drawMoneyRow(
    "Deposits to Date to Sunview",
    money(calc.depositsToDate, true),
    { bold: true }
  );

  y -= 10;
  ensureSpace(36);

  // ── Black Cash to Close bar ──
  const barHeight = 28;
  const barY = y - barHeight + 8;
  page.drawRectangle({
    x: marginL,
    y: barY,
    width: contentW,
    height: barHeight,
    color: black,
  });
  page.drawText("CASH TO CLOSE (Balance as of today)", {
    x: marginL + 10,
    y: barY + 9,
    size: 11,
    font: fontBold,
    color: white,
  });
  const cashText = money(calc.cashToClose);
  const cashW = fontBold.widthOfTextAtSize(cashText, 12);
  page.drawText(cashText, {
    x: amountX - 10 - cashW,
    y: barY + 9,
    size: 12,
    font: fontBold,
    color: white,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/** HTML preview that mirrors PDF structure (same calculation object). */
export function generateStatementOfAdjustmentsHtml(
  data: PrintableStatementOfAdjustments
): string {
  const calc = data.calculations;
  const coRows =
    calc.changeOrders.length === 0
      ? `<tr><td colspan="2" class="muted indent">None</td></tr>`
      : calc.changeOrders
          .map(
            (co) =>
              `<tr><td class="indent">${escapeHtml(co.label)}</td><td class="amt">${money(co.amount)}</td></tr>`
          )
          .join("");
  const depRows =
    calc.deposits.length === 0
      ? `<tr><td colspan="2" class="muted indent">None</td></tr>`
      : calc.deposits
          .map(
            (d) =>
              `<tr><td class="indent">${escapeHtml(d.label)}</td><td class="amt">${money(d.amount)}</td></tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Statement of Adjustments – ${escapeHtml(data.statementNumber)}</title>
<style>
  @page { size: letter; margin: 14mm 12mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 12px; margin: 0; padding: 24px; }
  .legal-name { font-size: 15px; font-weight: 700; letter-spacing: 0.02em; }
  .muted { color: #555; font-size: 11px; }
  h1 { text-align: center; font-size: 18px; margin: 22px 0 20px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; margin-bottom: 18px; }
  .field label { display: block; font-size: 10px; color: #555; }
  .field .value { border-bottom: 1px solid #222; padding: 4px 0 3px; min-height: 18px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; vertical-align: top; }
  td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .bold td, td.bold { font-weight: 700; }
  .indent { padding-left: 14px; }
  .section { font-weight: 700; padding-top: 8px; }
  .cash-bar {
    margin-top: 16px; background: #000; color: #fff; display: flex;
    justify-content: space-between; align-items: center;
    padding: 10px 12px; font-weight: 700; font-size: 13px;
  }
  hr { border: none; border-top: 1px solid #ccc; margin: 10px 0 14px; }
</style>
</head>
<body>
  <div class="legal-name">${escapeHtml(data.companyLegal.legalName)}</div>
  <div class="muted">${escapeHtml(data.companyLegal.addressLine1)}</div>
  ${
    data.companyLegal.cityLine &&
    data.companyLegal.cityLine !== data.companyLegal.addressLine1
      ? `<div class="muted">${escapeHtml(data.companyLegal.cityLine)}</div>`
      : ""
  }
  <div class="muted">${escapeHtml(data.companyLegal.gstNumber)}</div>
  <h1>Statement of Adjustments</h1>
  <div class="grid">
    <div class="field"><label>Municipal Address</label><div class="value">${escapeHtml(data.party.municipalAddress || "")}</div></div>
    <div class="field"><label>Date</label><div class="value">${escapeHtml(formatDate(data.party.statementDate) || "")}</div></div>
    <div class="field"><label>Buyer Name</label><div class="value">${escapeHtml(data.party.buyerName || "")}</div></div>
    <div class="field"><label>Contract #</label><div class="value">${escapeHtml(data.party.contractNumber || "")}</div></div>
    <div class="field"><label>Phone</label><div class="value">${escapeHtml(data.party.phone || "")}</div></div>
    <div class="field"><label>Legal Description</label><div class="value">${escapeHtml(data.party.legalDescription || "")}</div></div>
    <div class="field"><label>Email</label><div class="value">${escapeHtml(data.party.email || "")}</div></div>
    <div class="field"><label>Possession Date</label><div class="value">${escapeHtml(formatDate(data.party.possessionDate) || "")}</div></div>
  </div>
  <hr />
  <table>
    <tr><td>Base Home Price (Including Lot Cost)</td><td class="amt">${money(calc.baseHomePrice)}</td></tr>
    <tr class="bold"><td>Subtotal</td><td class="amt">${money(calc.subtotal)}</td></tr>
    <tr><td class="section" colspan="2">Approved Change Orders</td></tr>
    ${coRows}
    <tr class="bold"><td>Change Orders Subtotal</td><td class="amt">${money(calc.changeOrdersSubtotal)}</td></tr>
    <tr><td>Allowance (Promo credit towards Change Orders)</td><td class="amt">${money(calc.promoCreditAdjustment, true)}</td></tr>
    <tr class="bold"><td>Change Orders Total (Without GST)</td><td class="amt">${money(calc.changeOrdersTotalWithoutGst)}</td></tr>
    <tr class="bold"><td>TOTAL CLOSING PRICE</td><td class="amt">${money(calc.totalClosingPrice)}</td></tr>
    <tr><td>GST ${calc.gstRatePercent}%</td><td class="amt">${money(calc.totalGst)}</td></tr>
    <tr class="bold"><td>Total GST</td><td class="amt">${money(calc.totalGst)}</td></tr>
    <tr class="bold"><td>TOTAL SALES PRICE</td><td class="amt">${money(calc.totalSalesPrice)}</td></tr>
    <tr><td class="section" colspan="2">Deposits</td></tr>
    ${depRows}
    <tr class="bold"><td>Deposits to Date to Sunview</td><td class="amt">${money(calc.depositsToDate, true)}</td></tr>
  </table>
  <div class="cash-bar">
    <span>CASH TO CLOSE (Balance as of today)</span>
    <span>${money(calc.cashToClose)}</span>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function soaPdfFilename(input: {
  statementNumber: string;
  projectName: string;
  contractNumber?: string | null;
}) {
  const raw =
    input.contractNumber?.trim() ||
    input.statementNumber ||
    input.projectName ||
    "Statement";
  const safe = raw.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  return `SOA-${safe}-Sunview.pdf`;
}
