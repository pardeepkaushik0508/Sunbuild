import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatCurrency, formatDate } from "@/lib/utils";
import { embedSunviewLogo } from "@/lib/branding/sunview-logo";

export type PrintableContractData = {
  contractNumber: string;
  version: number;
  contractDate?: Date | string | null;
  effectiveDate?: Date | string | null;
  targetClosing?: Date | string | null;
  builderName: string;
  buyerName: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  buyerAddress?: string | null;
  projectName?: string | null;
  municipalAddress?: string | null;
  legalAddress?: string | null;
  lotBlockPlan?: string | null;
  basePrice: number;
  allowanceTotal: number;
  upgradesTotal: number;
  discountsTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalContractPrice: number;
  scopeSummary?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  specialConditions?: string | null;
  clientTerms?: string | null;
  status: string;
  soaItems?: Array<{
    category: string;
    name: string;
    location?: string | null;
    amount: number;
    notes?: string | null;
  }>;
};

/**
 * Generates high-resolution printable HTML markup for Purchase Contracts,
 * styled for browser print preview and saving as PDF.
 */
export function generateContractHtml(data: PrintableContractData): string {
  const contractDateStr = formatDate(data.contractDate) || "—";
  const closingDateStr = formatDate(data.targetClosing) || "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Purchase Contract – ${data.contractNumber}</title>
  <style>
    @page {
      size: letter;
      margin: 18mm 16mm 20mm 16mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #f97316;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .logo {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo img {
      height: 44px;
      width: auto;
      background: #000;
      padding: 4px 6px;
    }
    .logo span {
      color: #f28c0c;
    }
    .subtitle {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    .contract-badge {
      text-align: right;
    }
    .badge-number {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .badge-meta {
      font-size: 11px;
      color: #6b7280;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 14px;
      background: #f9fafb;
    }
    .card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
    }
    .field-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .field-label {
      color: #6b7280;
    }
    .field-value {
      font-weight: 600;
      color: #111827;
      text-align: right;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 12px;
    }
    th {
      background: #f3f4f6;
      border-bottom: 2px solid #e5e7eb;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      font-size: 11px;
      text-transform: uppercase;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    .text-right {
      text-align: right;
    }
    .financial-totals {
      width: 340px;
      margin-left: auto;
      margin-bottom: 24px;
    }
    .total-row-grand {
      font-size: 15px;
      font-weight: 700;
      color: #f97316;
      border-top: 2px solid #111827;
      border-bottom: 2px solid #111827;
      padding: 6px 0;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      margin: 16px 0 8px 0;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
    }
    .prose {
      font-size: 11px;
      color: #374151;
      margin-bottom: 16px;
      white-space: pre-line;
    }
    .signatures {
      margin-top: 36px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      page-break-inside: avoid;
    }
    .sig-line {
      border-top: 1px solid #111827;
      padding-top: 6px;
      font-size: 12px;
    }
    .page-break {
      page-break-before: always;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    .print-btn-bar {
      background: #111827;
      color: #ffffff;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-radius: 6px;
    }
    .print-btn {
      background: #f97316;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="no-print print-btn-bar">
    <span>SUNBUILD Contract Document Preview</span>
    <div style="display: flex; gap: 10px;">
      <a href="/api/contracts/${data.contractNumber}/pdf" style="color: #fff; text-decoration: underline; font-size: 13px; display: flex; align-items: center;">Download PDF File</a>
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>

  <div class="header">
    <div>
      <div class="logo"><img src="/branding/sunview-logo.png" alt="Sunview Custom Homes" /> SUNVIEW <span>CUSTOM HOMES</span></div>
      <div class="subtitle">Standard Residential Purchase Agreement</div>
    </div>
    <div class="contract-badge">
      <div class="badge-number">${data.contractNumber}</div>
      <div class="badge-meta">Version ${data.version} · Status: ${data.status.replace(/_/g, " ")}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Buyer / Purchaser Information</div>
      <div class="field-row">
        <span class="field-label">Name:</span>
        <span class="field-value">${data.buyerName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Email:</span>
        <span class="field-value">${data.buyerEmail || "—"}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Phone:</span>
        <span class="field-value">${data.buyerPhone || "—"}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Mailing Address:</span>
        <span class="field-value">${data.buyerAddress || "—"}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Property & Project Details</div>
      <div class="field-row">
        <span class="field-label">Project / Model:</span>
        <span class="field-value">${data.projectName || "Custom Home Build"}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Municipal Address:</span>
        <span class="field-value">${data.municipalAddress || "—"}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Lot / Block / Plan:</span>
        <span class="field-value">${data.lotBlockPlan || data.legalAddress || "—"}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Target Closing Date:</span>
        <span class="field-value">${closingDateStr}</span>
      </div>
    </div>
  </div>

  <div class="section-title">Financial Summary</div>
  <table class="financial-totals">
    <tr>
      <td class="field-label">Base Contract Price:</td>
      <td class="text-right font-semibold">${formatCurrency(data.basePrice)}</td>
    </tr>
    <tr>
      <td class="field-label">Schedule of Allowances (SOA):</td>
      <td class="text-right font-semibold">${formatCurrency(data.allowanceTotal)}</td>
    </tr>
    ${
      data.upgradesTotal > 0
        ? `<tr>
            <td class="field-label">Pre-contract Upgrades:</td>
            <td class="text-right font-semibold">+${formatCurrency(data.upgradesTotal)}</td>
          </tr>`
        : ""
    }
    ${
      data.discountsTotal > 0
        ? `<tr>
            <td class="field-label">Credits & Discounts:</td>
            <td class="text-right font-semibold">-${formatCurrency(data.discountsTotal)}</td>
          </tr>`
        : ""
    }
    <tr>
      <td class="field-label" style="border-top: 1px solid #e5e7eb;">Subtotal:</td>
      <td class="text-right font-semibold" style="border-top: 1px solid #e5e7eb;">${formatCurrency(data.subtotal)}</td>
    </tr>
    <tr>
      <td class="field-label">GST (${data.taxRate}%):</td>
      <td class="text-right font-semibold">${formatCurrency(data.taxAmount)}</td>
    </tr>
    <tr class="total-row-grand">
      <td>Total Purchase Price (CAD):</td>
      <td class="text-right">${formatCurrency(data.totalContractPrice)}</td>
    </tr>
  </table>

  ${
    data.scopeSummary
      ? `<div class="section-title">Scope of Construction</div>
         <div class="prose">${data.scopeSummary}</div>`
      : ""
  }

  ${
    data.inclusions
      ? `<div class="section-title">Standard Inclusions</div>
         <div class="prose">${data.inclusions}</div>`
      : ""
  }

  ${
    data.exclusions
      ? `<div class="section-title">Exclusions</div>
         <div class="prose">${data.exclusions}</div>`
      : ""
  }

  ${
    data.specialConditions
      ? `<div class="section-title">Special Conditions & Stipulations</div>
         <div class="prose">${data.specialConditions}</div>`
      : ""
  }

  ${
    data.clientTerms
      ? `<div class="section-title">Terms & Conditions of Agreement</div>
         <div class="prose">${data.clientTerms}</div>`
      : ""
  }

  <div class="signatures">
    <div>
      <div style="height: 48px;"></div>
      <div class="sig-line">
        <strong>Purchaser Signature</strong><br />
        ${data.buyerName}<br />
        Date: ________________________
      </div>
    </div>
    <div>
      <div style="height: 48px;"></div>
      <div class="sig-line">
        <strong>Builder Representative</strong><br />
        ${data.builderName}<br />
        Date: ________________________
      </div>
    </div>
  </div>

  ${
    data.soaItems && data.soaItems.length > 0
      ? `<div class="page-break"></div>
         <div class="header">
           <div>
             <div class="logo"><img src="/branding/sunview-logo.png" alt="Sunview Custom Homes" /> SUNVIEW <span>CUSTOM HOMES</span></div>
             <div class="subtitle">Schedule of Allowances (SOA) – Annex A</div>
           </div>
           <div class="contract-badge">
             <div class="badge-number">${data.contractNumber}</div>
             <div class="badge-meta">Total Budgeted Allowance: ${formatCurrency(data.allowanceTotal)}</div>
           </div>
         </div>

         <table>
           <thead>
             <tr>
               <th>Category</th>
               <th>Allowance Item</th>
               <th>Location</th>
               <th class="text-right">Budget Amount</th>
             </tr>
           </thead>
           <tbody>
             ${data.soaItems
               .map(
                 (item) => `
               <tr>
                 <td style="font-weight: 600;">${item.category}</td>
                 <td>${item.name}${item.notes ? `<div style="font-size: 10px; color: #6b7280;">${item.notes}</div>` : ""}</td>
                 <td>${item.location || "—"}</td>
                 <td class="text-right font-semibold">${formatCurrency(item.amount)}</td>
               </tr>
             `
               )
               .join("")}
             <tr style="background: #f9fafb; font-weight: 700; border-top: 2px solid #111827;">
               <td colspan="3">Total Schedule of Allowances:</td>
               <td class="text-right" style="color: #f97316;">${formatCurrency(data.allowanceTotal)}</td>
             </tr>
           </tbody>
         </table>`
      : ""
  }
</body>
</html>`;
}

export type PrintableSoaData = {
  soaNumber: string;
  contractNumber: string;
  version: number;
  clientName: string;
  projectName?: string | null;
  propertyAddress?: string | null;
  totalAllowance: number;
  effectiveDate?: Date | string | null;
  notes?: string | null;
  items: Array<{
    category: string;
    name: string;
    description?: string | null;
    location?: string | null;
    quantity?: number | null;
    unit?: string | null;
    amount: number;
    selectionDueDate?: Date | string | null;
  }>;
};

/**
 * Generates high-resolution printable HTML markup for Schedule of Allowances.
 */
export function generateSoaHtml(data: PrintableSoaData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Schedule of Allowances – ${data.soaNumber}</title>
  <style>
    @page {
      size: letter;
      margin: 18mm 16mm 20mm 16mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #f97316;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .logo {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo img {
      height: 44px;
      width: auto;
      background: #000;
      padding: 4px 6px;
    }
    .logo span {
      color: #f28c0c;
    }
    .subtitle {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-number {
      font-size: 18px;
      font-weight: 700;
      text-align: right;
    }
    .badge-meta {
      font-size: 11px;
      color: #6b7280;
      text-align: right;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 12px;
    }
    .meta-label {
      color: #6b7280;
      font-size: 11px;
    }
    .meta-val {
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 12px;
    }
    th {
      background: #f3f4f6;
      border-bottom: 2px solid #e5e7eb;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      font-size: 11px;
      text-transform: uppercase;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    .text-right {
      text-align: right;
    }
    .print-btn-bar {
      background: #111827;
      color: #ffffff;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-radius: 6px;
    }
    .print-btn {
      background: #f97316;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print print-btn-bar">
    <span>SUNBUILD Schedule of Allowances (SOA)</span>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="header">
    <div>
      <div class="logo"><img src="/branding/sunview-logo.png" alt="Sunview Custom Homes" /> SUNVIEW <span>CUSTOM HOMES</span></div>
      <div class="subtitle">Official Schedule of Allowances (SOA)</div>
    </div>
    <div>
      <div class="badge-number">${data.soaNumber}</div>
      <div class="badge-meta">Contract #${data.contractNumber} · Version ${data.version}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div>
      <div class="meta-label">Client</div>
      <div class="meta-val">${data.clientName}</div>
    </div>
    <div>
      <div class="meta-label">Project / Property</div>
      <div class="meta-val">${data.propertyAddress || data.projectName || "Custom Home Build"}</div>
    </div>
    <div>
      <div class="meta-label">Total Budgeted Allowance</div>
      <div class="meta-val" style="color: #f97316;">${formatCurrency(data.totalAllowance)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Item & Specification</th>
        <th>Location</th>
        <th>Quantity</th>
        <th>Selection Due Date</th>
        <th class="text-right">Allowance Amount</th>
      </tr>
    </thead>
    <tbody>
      ${data.items
        .map(
          (item) => `
        <tr>
          <td style="font-weight: 600;">${item.category}</td>
          <td>
            <strong>${item.name}</strong>
            ${item.description ? `<div style="font-size: 11px; color: #6b7280;">${item.description}</div>` : ""}
          </td>
          <td>${item.location || "—"}</td>
          <td>${item.quantity ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
          <td>${item.selectionDueDate ? formatDate(item.selectionDueDate) : "—"}</td>
          <td class="text-right font-semibold">${formatCurrency(item.amount)}</td>
        </tr>
      `
        )
        .join("")}
      <tr style="background: #f9fafb; font-weight: 700; border-top: 2px solid #111827;">
        <td colspan="5">Total Budgeted Allowance (CAD):</td>
        <td class="text-right" style="color: #f97316; font-size: 14px;">${formatCurrency(data.totalAllowance)}</td>
      </tr>
    </tbody>
  </table>

  ${
    data.notes
      ? `<div style="font-size: 11px; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px;">
           <strong>Allowance Terms & Notes:</strong><br />
           ${data.notes}
         </div>`
      : ""
  }
</body>
</html>`;
}

/**
 * Generates an authoritative binary PDF Buffer using pdf-lib for direct file downloads.
 */
export async function generateContractPdfBuffer(
  data: PrintableContractData
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Standard US Letter

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logo = await embedSunviewLogo(pdfDoc);

  const primaryColor = rgb(0.95, 0.55, 0.05);
  const inkColor = rgb(0.067, 0.094, 0.153);
  const mutedColor = rgb(0.42, 0.447, 0.502);
  const black = rgb(0, 0, 0);

  let y = 750;

  // Header with Sunview logo
  if (logo) {
    const maxH = 44;
    const scale = maxH / logo.height;
    const logoW = logo.width * scale;
    const logoH = logo.height * scale;
    page.drawRectangle({
      x: 46,
      y: y - logoH - 4,
      width: logoW + 8,
      height: logoH + 8,
      color: black,
    });
    page.drawImage(logo, {
      x: 50,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    page.drawText(`Contract: ${data.contractNumber}`, {
      x: 400,
      y: y - 8,
      size: 14,
      font: fontBold,
      color: inkColor,
    });
    y -= logoH + 18;
  } else {
    page.drawText("SUNVIEW CUSTOM HOMES", {
      x: 50,
      y,
      size: 18,
      font: fontBold,
      color: primaryColor,
    });
    page.drawText(`Contract: ${data.contractNumber}`, {
      x: 400,
      y,
      size: 14,
      font: fontBold,
      color: inkColor,
    });
    y -= 16;
  }

  page.drawText("Standard Residential Purchase Agreement — Page 1", {
    x: 50,
    y,
    size: 10,
    font: fontRegular,
    color: mutedColor,
  });
  page.drawText(`Version ${data.version} · Status: ${data.status.replace(/_/g, " ")}`, {
    x: 400,
    y,
    size: 9,
    font: fontRegular,
    color: mutedColor,
  });

  y -= 14;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 1.5,
    color: primaryColor,
  });

  // Client & Property summary
  y -= 30;
  page.drawText("BUYER / PURCHASER", { x: 50, y, size: 10, font: fontBold, color: mutedColor });
  page.drawText("PROPERTY DETAILS", { x: 310, y, size: 10, font: fontBold, color: mutedColor });

  y -= 16;
  page.drawText(`Name: ${data.buyerName}`, { x: 50, y, size: 10, font: fontRegular, color: inkColor });
  page.drawText(`Project: ${data.projectName || "Custom Home"}`, { x: 310, y, size: 10, font: fontRegular, color: inkColor });

  y -= 14;
  page.drawText(`Email: ${data.buyerEmail || "—"}`, { x: 50, y, size: 10, font: fontRegular, color: inkColor });
  page.drawText(`Address: ${data.municipalAddress || "—"}`, { x: 310, y, size: 10, font: fontRegular, color: inkColor });

  y -= 14;
  page.drawText(`Phone: ${data.buyerPhone || "—"}`, { x: 50, y, size: 10, font: fontRegular, color: inkColor });
  page.drawText(`Lot / plan: ${data.lotBlockPlan || data.legalAddress || "Not set"}`, { x: 310, y, size: 10, font: fontRegular, color: inkColor });

  // Financial Breakdown
  y -= 34;
  page.drawText("FINANCIAL BREAKDOWN", { x: 50, y, size: 11, font: fontBold, color: inkColor });
  y -= 8;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: rgb(0.898, 0.906, 0.922) });

  const financialRows = [
    ["Base Contract Price:", formatCurrency(data.basePrice)],
    ["Schedule of Allowances (SOA):", formatCurrency(data.allowanceTotal)],
    ["Pre-contract Upgrades:", `+${formatCurrency(data.upgradesTotal)}`],
    ["Credits & Discounts:", `-${formatCurrency(data.discountsTotal)}`],
    ["Subtotal:", formatCurrency(data.subtotal)],
    [`Applicable Taxes (GST ${data.taxRate}%):`, formatCurrency(data.taxAmount)],
    ["TOTAL PURCHASE PRICE (CAD):", formatCurrency(data.totalContractPrice)],
  ];

  for (const [label, val] of financialRows) {
    y -= 18;
    const isGrand = label.startsWith("TOTAL");
    page.drawText(label, {
      x: 70,
      y,
      size: isGrand ? 11 : 10,
      font: isGrand ? fontBold : fontRegular,
      color: isGrand ? primaryColor : inkColor,
    });
    page.drawText(val, {
      x: 460,
      y,
      size: isGrand ? 11 : 10,
      font: isGrand ? fontBold : fontRegular,
      color: isGrand ? primaryColor : inkColor,
    });
  }

  // Scope summary
  if (data.scopeSummary) {
    y -= 30;
    page.drawText("SCOPE SUMMARY", { x: 50, y, size: 10, font: fontBold, color: inkColor });
    y -= 14;
    const snippet = data.scopeSummary.slice(0, 300);
    page.drawText(snippet, { x: 50, y, size: 9, font: fontRegular, color: mutedColor, maxWidth: 512 });
  }

  // Signatures
  y = 120;
  page.drawLine({ start: { x: 50, y }, end: { x: 250, y }, thickness: 1, color: inkColor });
  page.drawLine({ start: { x: 310, y }, end: { x: 510, y }, thickness: 1, color: inkColor });

  y -= 14;
  page.drawText("Purchaser Signature & Date", { x: 50, y, size: 9, font: fontRegular, color: mutedColor });
  page.drawText("Builder Representative Signature & Date", { x: 310, y, size: 9, font: fontRegular, color: mutedColor });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generates an authoritative binary PDF Buffer for Schedule of Allowances.
 */
export async function generateSoaPdfBuffer(data: PrintableSoaData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const primaryColor = rgb(0.976, 0.451, 0.086);
  const inkColor = rgb(0.067, 0.094, 0.153);
  const mutedColor = rgb(0.42, 0.447, 0.502);

  let y = 750;

  page.drawText("SUNVIEW CUSTOM HOMES", { x: 50, y, size: 18, font: fontBold, color: primaryColor });
  page.drawText(`SOA: ${data.soaNumber}`, { x: 400, y, size: 14, font: fontBold, color: inkColor });

  y -= 16;
  page.drawText("Schedule of Allowances", { x: 50, y, size: 10, font: fontRegular, color: mutedColor });
  page.drawText(`Contract #${data.contractNumber} · Version ${data.version}`, { x: 400, y, size: 9, font: fontRegular, color: mutedColor });

  y -= 14;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1.5, color: primaryColor });

  y -= 30;
  page.drawText(`Client: ${data.clientName}`, { x: 50, y, size: 10, font: fontRegular, color: inkColor });
  page.drawText(`Property: ${data.propertyAddress || "—"}`, { x: 260, y, size: 10, font: fontRegular, color: inkColor });
  page.drawText(`Total: ${formatCurrency(data.totalAllowance)}`, { x: 460, y, size: 10, font: fontBold, color: primaryColor });

  y -= 24;
  page.drawText("CATEGORY", { x: 50, y, size: 9, font: fontBold, color: mutedColor });
  page.drawText("ALLOWANCE ITEM", { x: 180, y, size: 9, font: fontBold, color: mutedColor });
  page.drawText("LOCATION", { x: 360, y, size: 9, font: fontBold, color: mutedColor });
  page.drawText("AMOUNT", { x: 480, y, size: 9, font: fontBold, color: mutedColor });

  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: rgb(0.898, 0.906, 0.922) });

  for (const item of data.items) {
    y -= 18;
    if (y < 60) break;
    page.drawText(item.category.slice(0, 20), { x: 50, y, size: 9, font: fontBold, color: inkColor });
    page.drawText(item.name.slice(0, 30), { x: 180, y, size: 9, font: fontRegular, color: inkColor });
    page.drawText((item.location || "—").slice(0, 16), { x: 360, y, size: 9, font: fontRegular, color: mutedColor });
    page.drawText(formatCurrency(item.amount), { x: 480, y, size: 9, font: fontBold, color: inkColor });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
