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
  const muted = rgb(0.38, 0.38, 0.38);
  const rule = rgb(0.12, 0.12, 0.12);
  const amountRule = rgb(0.22, 0.22, 0.22);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginL = 54;
  const marginR = 54;
  const contentW = pageWidth - marginL - marginR;
  const colGap = 48;
  const colW = (contentW - colGap) / 2;
  const rightColX = marginL + colW + colGap;
  const amountX = pageWidth - marginR;
  const amountColW = 132;
  const labelValueGap = 42;
  const labelRightX = amountX - amountColW - labelValueGap;
  const sectionX = 184;
  const lineItemX = 202;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 36;

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
    bold = false,
    color = ink
  ) => {
    const font = bold ? fontBold : fontRegular;
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: xRight - w,
      y: yPos,
      size,
      font,
      color,
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
    y -= 4;
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
      indent?: boolean;
      muted?: boolean;
      size?: number;
    }
  ) => {
    ensureSpace(22);
    const size = opts?.size ?? 9;
    const font = opts?.bold ? fontBold : fontRegular;
    const labelColor = opts?.bold && !opts?.muted ? ink : muted;

    if (opts?.indent) {
      page.drawText(label, {
        x: lineItemX,
        y,
        size,
        font,
        color: labelColor,
      });
    } else {
      const w = font.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: labelRightX - w,
        y,
        size,
        font,
        color: labelColor,
      });
    }

    drawTextRight(amount, amountX, y, size, !!opts?.bold, ink);
    page.drawLine({
      start: { x: amountX - amountColW, y: y - 3.5 },
      end: { x: amountX, y: y - 3.5 },
      thickness: 0.55,
      color: amountRule,
    });
    y -= 14;
  };

  // ── Letterhead: logo top-left, address + GST under logo (client reference) ──
  let headerBottom = y;
  if (logo) {
    const maxH = 42;
    const scale = maxH / logo.height;
    const logoW = Math.min(logo.width * scale, 210);
    const logoH = logo.height * (logoW / logo.width);
    page.drawImage(logo, {
      x: marginL,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    headerBottom = y - logoH - 16;
  } else {
    page.drawText(data.companyLegal.legalName, {
      x: marginL,
      y,
      size: 13,
      font: fontBold,
      color: ink,
    });
    headerBottom = y - 18;
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
    y -= 18;
  } else {
    y -= 8;
  }

  // Centered title
  y -= 4;
  const title = "Statement of Adjustments";
  const titleSize = 13;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (pageWidth - titleW) / 2,
    y,
    size: titleSize,
    font: fontBold,
    color: ink,
  });
  y -= 28;

  // ── Party fields: Municipal Address full width, then two columns ──
  drawInlineField(
    "Municipal Address",
    data.party.municipalAddress || "",
    marginL,
    contentW
  );
  y -= 20;

  const leftStartY = y;
  let leftY = y;
  const drawLeft = (label: string, value: string) => {
    y = leftY;
    drawInlineField(label, value, marginL, colW);
    leftY = y - 22;
  };
  drawLeft("Buyer Name", data.party.buyerName || "");
  drawLeft("Phone", data.party.phone || "");
  drawLeft("Email", data.party.email || "");

  y = leftStartY;
  let rightY = leftStartY;
  const drawRight = (label: string, value: string) => {
    y = rightY;
    drawInlineField(label, value, rightColX, colW);
    rightY = y - 22;
  };
  drawRight("Date", formatDate(data.party.statementDate) || "");
  drawRight("Contract #", data.party.contractNumber || "");
  drawRight("Legal Description", data.party.legalDescription || "");
  drawRight(
    "Possession Date: (Firm)",
    formatDate(data.party.possessionDate) || ""
  );

  y = Math.min(leftY, rightY) - 6;

  // Thick separator before financial body
  page.drawLine({
    start: { x: marginL, y },
    end: { x: amountX, y },
    thickness: 1.4,
    color: rule,
  });
  y -= 22;

  // ── Financial body (client reference order, with optional GST) ──
  const calc = data.calculations;

  drawMoneyRow(
    "Base Home Price (Including Lot Cost)",
    money(calc.baseHomePrice)
  );
  drawMoneyRow("Subtotal", money(calc.subtotal), { bold: true });
  y -= 4;

  page.drawText("Approved Change Orders", {
    x: sectionX,
    y,
    size: 9,
    font: fontBold,
    color: ink,
  });
  y -= 15;

  if (calc.changeOrders.length === 0) {
    page.drawText("None", {
      x: lineItemX,
      y,
      size: 9,
      font: fontRegular,
      color: muted,
    });
    y -= 15;
  } else {
    for (const co of calc.changeOrders) {
      drawMoneyRow(co.label, money(co.amount), { indent: true, muted: true });
    }
  }

  drawMoneyRow("Change Orders Subtotal", money(calc.changeOrdersSubtotal), {
    bold: true,
  });
  drawMoneyRow(
    "Allowance (Promo credit towards Change Orders)",
    money(calc.promoCreditAdjustment, true),
    { muted: true }
  );
  drawMoneyRow(
    "Change Orders Total (Without GST)",
    money(calc.changeOrdersTotalWithoutGst),
    { bold: true }
  );
  drawMoneyRow("TOTAL CLOSING PRICE", money(calc.totalClosingPrice), {
    bold: true,
  });

  if (calc.includeGst) {
    const gstLabel =
      calc.gstRatePercent > 0
        ? `GST ${calc.gstRatePercent % 1 === 0 ? String(calc.gstRatePercent) : calc.gstRatePercent.toFixed(2)}%`
        : "GST";
    drawMoneyRow(gstLabel, money(calc.totalGst), { muted: true });
    drawMoneyRow("Total GST", money(calc.totalGst), { bold: true });
  }

  drawMoneyRow("TOTAL SALES PRICE", money(calc.totalSalesPrice), {
    bold: true,
  });
  y -= 4;

  if (calc.deposits.length > 0) {
    for (const dep of calc.deposits) {
      drawMoneyRow(dep.label, money(dep.amount), { indent: true, muted: true });
    }
  }

  drawMoneyRow(
    "Deposits to Date to Sunview",
    money(calc.depositsToDate, true),
    { bold: true }
  );

  y -= 24;
  ensureSpace(40);

  const barHeight = 24;
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
    size: 9,
    font: fontBold,
    color: white,
  });
  const cashText = money(calc.cashToClose);
  const cashW = fontBold.widthOfTextAtSize(cashText, 10);
  page.drawText(cashText, {
    x: amountX - 10 - cashW,
    y: barY + 8,
    size: 10,
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
  const gstRows = calc.includeGst
    ? `<tr class="muted"><td>${escapeHtml(gstLabel)}</td><td class="amt">${money(calc.totalGst)}</td></tr>
    <tr class="bold"><td>Total GST</td><td class="amt">${money(calc.totalGst)}</td></tr>`
    : "";
  const coRows =
    calc.changeOrders.length === 0
      ? `<tr><td colspan="2" class="muted indent">None</td></tr>`
      : calc.changeOrders
          .map(
            (co) =>
              `<tr class="lineitem"><td>${escapeHtml(co.label)}</td><td class="amt">${money(co.amount)}</td></tr>`
          )
          .join("");
  const depRows =
    calc.deposits.length === 0
      ? ""
      : calc.deposits
          .map(
            (d) =>
              `<tr class="lineitem"><td>${escapeHtml(d.label)}</td><td class="amt">${money(d.amount)}</td></tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Statement of Adjustments – ${escapeHtml(data.statementNumber)}</title>
<style>
  @page { size: letter; margin: 14mm 14mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #000; font-size: 11px; margin: 0; padding: 20px 24px; }
  .letterhead { margin-bottom: 14px; }
  .logo-wrap { display: inline-block; padding: 0; }
  .logo-wrap img { height: 42px; width: auto; display: block; }
  .addr { margin-top: 14px; font-size: 11px; line-height: 1.45; }
  h1 { text-align: center; font-size: 15px; margin: 16px 0 22px; font-weight: 700; }
  .field { margin-bottom: 20px; }
  .field .line {
    border-bottom: 1px solid #111; padding: 2px 0 4px; min-height: 16px; font-size: 12px;
  }
  .field .line .lbl { margin-right: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 48px; margin-bottom: 8px; }
  .thick { border: none; border-top: 1.5px solid #111; margin: 14px 0 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 7px 0; vertical-align: top; border: none; }
  td:first-child {
    text-align: right; padding-right: 36px; color: #616161; width: auto;
  }
  td.amt {
    text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
    width: 140px; border-bottom: 1px solid #333; color: #000;
  }
  .bold td, td.bold, tr.bold td { font-weight: 700; color: #000; }
  tr.bold td:first-child { color: #000; }
  tr.muted td:first-child, .muted { color: #6b6b6b; }
  tr.lineitem td:first-child {
    text-align: left; padding-left: 72px; color: #6b6b6b;
  }
  .indent { padding-left: 72px; text-align: left !important; }
  .section { font-weight: 700; padding-top: 8px; text-align: left !important; color: #000 !important; }
  .cash-bar {
    margin-top: 28px; background: #000; color: #fff; display: flex;
    justify-content: space-between; align-items: center;
    padding: 8px 12px; font-weight: 700; font-size: 11px;
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
    <tr class="muted"><td>Base Home Price (Including Lot Cost)</td><td class="amt">${money(calc.baseHomePrice)}</td></tr>
    <tr class="bold"><td>Subtotal</td><td class="amt">${money(calc.subtotal)}</td></tr>
    <tr><td class="section" colspan="2">Approved Change Orders</td></tr>
    ${coRows}
    <tr class="bold"><td>Change Orders Subtotal</td><td class="amt">${money(calc.changeOrdersSubtotal)}</td></tr>
    <tr class="muted"><td>Allowance (Promo credit towards Change Orders)</td><td class="amt">${money(calc.promoCreditAdjustment, true)}</td></tr>
    <tr class="bold"><td>Change Orders Total (Without GST)</td><td class="amt">${money(calc.changeOrdersTotalWithoutGst)}</td></tr>
    <tr class="bold"><td>TOTAL CLOSING PRICE</td><td class="amt">${money(calc.totalClosingPrice)}</td></tr>
    ${gstRows}
    <tr class="bold"><td>TOTAL SALES PRICE</td><td class="amt">${money(calc.totalSalesPrice)}</td></tr>
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
