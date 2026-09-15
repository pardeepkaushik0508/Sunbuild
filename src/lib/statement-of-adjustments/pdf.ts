import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatDate } from "@/lib/utils";
import { embedSunviewLogo } from "@/lib/branding/sunview-logo";
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
 * Statement of Adjustments PDF — matches Sunview Custom Homes client reference:
 * logo + address + GST letterhead, underline party fields, GST 5%, cash-to-close bar.
 */
export async function generateStatementOfAdjustmentsPdfBuffer(
  data: PrintableStatementOfAdjustments
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logo = await embedSunviewLogo(pdfDoc);

  const ink = rgb(0, 0, 0);
  const muted = rgb(0.28, 0.28, 0.28);
  const rule = rgb(0.12, 0.12, 0.12);
  const lightRule = rgb(0.55, 0.55, 0.55);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginL = 54;
  const marginR = 54;
  const contentW = pageWidth - marginL - marginR;
  const colGap = 36;
  const colW = (contentW - colGap) / 2;
  const rightColX = marginL + colW + colGap;
  const amountX = pageWidth - marginR;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 40;

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
      size: 10,
      font: fontBold,
      color: ink,
    });
    page.drawText("Statement of Adjustments (continued)", {
      x: marginL,
      y: y - 13,
      size: 9,
      font: fontRegular,
      color: muted,
    });
    y -= 26;
    page.drawLine({
      start: { x: marginL, y },
      end: { x: amountX, y },
      thickness: 0.75,
      color: rule,
    });
    y -= 16;
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

  /** Label + value on one underline (client form style). */
  const drawInlineField = (
    label: string,
    value: string,
    x: number,
    width: number
  ) => {
    const labelText = label.includes(":") ? label : `${label}:`;
    const labelSize = 9;
    page.drawText(labelText, {
      x,
      y,
      size: labelSize,
      font: fontRegular,
      color: ink,
    });
    const labelW = fontRegular.widthOfTextAtSize(labelText, labelSize) + 6;
    const display = (value || "").slice(0, 52);
    if (display) {
      page.drawText(display, {
        x: x + labelW,
        y,
        size: 10,
        font: fontRegular,
        color: ink,
      });
    }
    y -= 3;
    page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: 0.7,
      color: rule,
    });
  };

  const drawMoneyRow = (
    label: string,
    amount: string,
    opts?: {
      bold?: boolean;
      indent?: number;
      size?: number;
      ruleAbove?: boolean;
    }
  ) => {
    if (opts?.ruleAbove) {
      ensureSpace(22);
      page.drawLine({
        start: { x: marginL, y: y + 10 },
        end: { x: amountX, y: y + 10 },
        thickness: 0.6,
        color: lightRule,
      });
    }
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
    y -= 15;
  };

  // ── Letterhead: logo top-left, address + GST under logo (client reference) ──
  let headerBottom = y;
  if (logo) {
    const maxH = 44;
    const scale = maxH / logo.height;
    const logoW = Math.min(logo.width * scale, 210);
    const logoH = logo.height * (logoW / logo.width);
    // Tight black pad so black-background logo art remains legible on white paper.
    page.drawRectangle({
      x: marginL - 2,
      y: y - logoH - 4,
      width: logoW + 4,
      height: logoH + 6,
      color: black,
    });
    page.drawImage(logo, {
      x: marginL,
      y: y - logoH - 1,
      width: logoW,
      height: logoH,
    });
    headerBottom = y - logoH - 10;
  } else {
    page.drawText(data.companyLegal.legalName, {
      x: marginL,
      y,
      size: 13,
      font: fontBold,
      color: ink,
    });
    headerBottom = y - 16;
  }

  y = headerBottom;
  page.drawText(data.companyLegal.addressLine1, {
    x: marginL,
    y,
    size: 9,
    font: fontRegular,
    color: ink,
  });
  y -= 12;
  page.drawText(data.companyLegal.cityLine, {
    x: marginL,
    y,
    size: 9,
    font: fontRegular,
    color: ink,
  });
  y -= 12;
  if (data.companyLegal.gstNumber) {
    page.drawText(data.companyLegal.gstNumber, {
      x: marginL,
      y,
      size: 9,
      font: fontRegular,
      color: ink,
    });
    y -= 14;
  } else {
    y -= 4;
  }

  // Centered title
  y -= 6;
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
  y -= 22;

  // ── Party fields: Municipal Address full width, then two columns ──
  drawInlineField(
    "Municipal Address",
    data.party.municipalAddress || "",
    marginL,
    contentW
  );
  y -= 14;

  const leftStartY = y;
  let leftY = y;
  const drawLeft = (label: string, value: string) => {
    y = leftY;
    drawInlineField(label, value, marginL, colW);
    leftY = y - 12;
  };
  drawLeft("Buyer Name", data.party.buyerName || "");
  drawLeft("Phone", data.party.phone || "");
  drawLeft("Email", data.party.email || "");

  y = leftStartY;
  let rightY = leftStartY;
  const drawRight = (label: string, value: string) => {
    y = rightY;
    drawInlineField(label, value, rightColX, colW);
    rightY = y - 12;
  };
  drawRight("Date", formatDate(data.party.statementDate) || "");
  drawRight("Contract #", data.party.contractNumber || "");
  drawRight("Legal Description", data.party.legalDescription || "");
  drawRight(
    "Possession Date: (Firm)",
    formatDate(data.party.possessionDate) || ""
  );

  y = Math.min(leftY, rightY) - 4;

  // Thick separator before financial body
  page.drawLine({
    start: { x: marginL, y },
    end: { x: amountX, y },
    thickness: 1.4,
    color: rule,
  });
  y -= 18;

  // ── Financial body (client reference order, with GST) ──
  const calc = data.calculations;

  drawMoneyRow(
    "Base Home Price (Including Lot Cost)",
    money(calc.baseHomePrice)
  );
  drawMoneyRow("Subtotal", money(calc.subtotal), {
    bold: true,
    ruleAbove: true,
  });
  y -= 4;

  page.drawText("Approved Change Orders", {
    x: marginL,
    y,
    size: 10,
    font: fontBold,
    color: ink,
  });
  y -= 15;

  if (calc.changeOrders.length === 0) {
    page.drawText("None", {
      x: marginL + 12,
      y,
      size: 10,
      font: fontRegular,
      color: muted,
    });
    y -= 15;
  } else {
    for (const co of calc.changeOrders) {
      drawMoneyRow(co.label, money(co.amount), { indent: 12 });
    }
  }

  drawMoneyRow("Change Orders Subtotal", money(calc.changeOrdersSubtotal), {
    bold: true,
    ruleAbove: true,
  });
  drawMoneyRow(
    "Allowance (Promo credit towards Change Orders)",
    money(calc.promoCreditAdjustment, true)
  );
  drawMoneyRow(
    "Change Orders Total (Without GST)",
    money(calc.changeOrdersTotalWithoutGst),
    { bold: true, ruleAbove: true }
  );
  drawMoneyRow("TOTAL CLOSING PRICE", money(calc.totalClosingPrice), {
    bold: true,
    ruleAbove: true,
  });

  // GST block (client reference)
  const gstLabel =
    calc.gstRatePercent > 0
      ? `GST ${calc.gstRatePercent % 1 === 0 ? String(calc.gstRatePercent) : calc.gstRatePercent.toFixed(2)}%`
      : "GST";
  drawMoneyRow(gstLabel, money(calc.totalGst));
  drawMoneyRow("Total GST", money(calc.totalGst), {
    bold: true,
    ruleAbove: true,
  });

  drawMoneyRow("TOTAL SALES PRICE", money(calc.totalSalesPrice), {
    bold: true,
    ruleAbove: true,
  });
  y -= 4;

  if (calc.deposits.length === 0) {
    // Still list deposits section only when present; reference always shows deposit lines.
  } else {
    for (const dep of calc.deposits) {
      drawMoneyRow(dep.label, money(dep.amount), { indent: 0 });
    }
  }

  drawMoneyRow(
    "Deposits to Date to Sunview",
    money(calc.depositsToDate, true),
    { bold: true, ruleAbove: true }
  );

  y -= 10;
  ensureSpace(36);

  const barHeight = 26;
  const barY = y - barHeight + 6;
  page.drawRectangle({
    x: marginL,
    y: barY,
    width: contentW,
    height: barHeight,
    color: black,
  });
  page.drawText("CASH TO CLOSE (Balance as of today)", {
    x: marginL + 10,
    y: barY + 8,
    size: 11,
    font: fontBold,
    color: white,
  });
  const cashText = money(calc.cashToClose);
  const cashW = fontBold.widthOfTextAtSize(cashText, 12);
  page.drawText(cashText, {
    x: amountX - 10 - cashW,
    y: barY + 8,
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
  const gstLabel =
    calc.gstRatePercent > 0
      ? `GST ${calc.gstRatePercent % 1 === 0 ? String(calc.gstRatePercent) : calc.gstRatePercent.toFixed(2)}%`
      : "GST";
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
      ? ""
      : calc.deposits
          .map(
            (d) =>
              `<tr><td>${escapeHtml(d.label)}</td><td class="amt">${money(d.amount)}</td></tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Statement of Adjustments – ${escapeHtml(data.statementNumber)}</title>
<style>
  @page { size: letter; margin: 14mm 14mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; font-size: 12px; margin: 0; padding: 20px 24px; }
  .letterhead { margin-bottom: 6px; }
  .logo-wrap { display: inline-block; background: #000; padding: 4px 6px; }
  .logo-wrap img { height: 42px; width: auto; display: block; }
  .addr { margin-top: 8px; font-size: 11px; line-height: 1.45; }
  h1 { text-align: center; font-size: 18px; margin: 18px 0 16px; font-weight: 700; }
  .field { margin-bottom: 12px; }
  .field .line {
    border-bottom: 1px solid #111; padding: 2px 0 3px; min-height: 16px; font-size: 12px;
  }
  .field .line .lbl { margin-right: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 36px; margin-bottom: 8px; }
  .thick { border: none; border-top: 1.5px solid #111; margin: 10px 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; }
  td.amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .bold td, td.bold, tr.bold td { font-weight: 700; }
  .indent { padding-left: 14px; }
  .section { font-weight: 700; padding-top: 6px; }
  .rule td { border-top: 1px solid #999; padding-top: 6px; }
  .muted { color: #555; }
  .cash-bar {
    margin-top: 14px; background: #000; color: #fff; display: flex;
    justify-content: space-between; align-items: center;
    padding: 9px 12px; font-weight: 700; font-size: 13px;
  }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="logo-wrap">
      <img src="/branding/sunview-logo.png" alt="Sunview Custom Homes" />
    </div>
    <div class="addr">
      ${escapeHtml(data.companyLegal.addressLine1)}<br />
      ${escapeHtml(data.companyLegal.cityLine)}<br />
      ${escapeHtml(data.companyLegal.gstNumber)}
    </div>
  </div>
  <h1>Statement of Adjustments</h1>

  <div class="field">
    <div class="line"><span class="lbl">Municipal Address:</span>${escapeHtml(data.party.municipalAddress || "")}</div>
  </div>
  <div class="grid">
    <div class="field"><div class="line"><span class="lbl">Buyer Name:</span>${escapeHtml(data.party.buyerName || "")}</div></div>
    <div class="field"><div class="line"><span class="lbl">Date:</span>${escapeHtml(formatDate(data.party.statementDate) || "")}</div></div>
    <div class="field"><div class="line"><span class="lbl">Phone:</span>${escapeHtml(data.party.phone || "")}</div></div>
    <div class="field"><div class="line"><span class="lbl">Contract #:</span>${escapeHtml(data.party.contractNumber || "")}</div></div>
    <div class="field"><div class="line"><span class="lbl">Email:</span>${escapeHtml(data.party.email || "")}</div></div>
    <div class="field"><div class="line"><span class="lbl">Legal Description:</span>${escapeHtml(data.party.legalDescription || "")}</div></div>
    <div></div>
    <div class="field"><div class="line"><span class="lbl">Possession Date: (Firm)</span> ${escapeHtml(formatDate(data.party.possessionDate) || "")}</div></div>
  </div>
  <hr class="thick" />

  <table>
    <tr><td>Base Home Price (Including Lot Cost)</td><td class="amt">${money(calc.baseHomePrice)}</td></tr>
    <tr class="bold rule"><td>Subtotal</td><td class="amt">${money(calc.subtotal)}</td></tr>
    <tr><td class="section" colspan="2">Approved Change Orders</td></tr>
    ${coRows}
    <tr class="bold rule"><td>Change Orders Subtotal</td><td class="amt">${money(calc.changeOrdersSubtotal)}</td></tr>
    <tr><td>Allowance (Promo credit towards Change Orders)</td><td class="amt">${money(calc.promoCreditAdjustment, true)}</td></tr>
    <tr class="bold rule"><td>Change Orders Total (Without GST)</td><td class="amt">${money(calc.changeOrdersTotalWithoutGst)}</td></tr>
    <tr class="bold rule"><td>TOTAL CLOSING PRICE</td><td class="amt">${money(calc.totalClosingPrice)}</td></tr>
    <tr><td>${escapeHtml(gstLabel)}</td><td class="amt">${money(calc.totalGst)}</td></tr>
    <tr class="bold rule"><td>Total GST</td><td class="amt">${money(calc.totalGst)}</td></tr>
    <tr class="bold rule"><td>TOTAL SALES PRICE</td><td class="amt">${money(calc.totalSalesPrice)}</td></tr>
    ${depRows}
    <tr class="bold rule"><td>Deposits to Date to Sunview</td><td class="amt">${money(calc.depositsToDate, true)}</td></tr>
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
