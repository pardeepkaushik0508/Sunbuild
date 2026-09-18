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
  buyerOccupation?: string | null;
  buyerIdNumber?: string | null;
  buyer2Name?: string | null;
  buyer2Email?: string | null;
  buyer2Phone?: string | null;
  buyer2Address?: string | null;
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
  firmPossessionDate?: Date | string | null;
  builderSignatureDate?: Date | string | null;
  purchaserAgreementReceiptDate?: Date | string | null;
  realtorName?: string | null;
  realtorPhone?: string | null;
  realtorEmail?: string | null;
  lawyerName?: string | null;
  lawyerPhone?: string | null;
  lawyerEmail?: string | null;
  basePrice: number;
  allowanceTotal: number;
  upgradesTotal: number;
  discountsTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  gstRebate?: number | null;
  totalContractPrice: number;
  deposits?: Array<{
    label: string;
    amount: number;
    dueDate?: Date | string | null;
  }>;
  conditions?: Array<{
    title: string;
    description?: string | null;
    dueDate?: Date | string | null;
    party?: "purchaser" | "builder" | string | null;
  }>;
  changeOrders?: Array<{
    title: string;
    amount: number;
  }>;
  changeOrderNotes?: string | null;
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

/** Parse "Lot 12, Block 3, Plan 2412345" (and loose variants) into parts. */
export function parseLotBlockPlan(raw?: string | null): {
  lot: string;
  block: string;
  plan: string;
} {
  const text = (raw || "").trim();
  if (!text) return { lot: "", block: "", plan: "" };
  const lot = text.match(/\blot\s*[:#]?\s*([A-Za-z0-9-]+)/i)?.[1] ?? "";
  const block = text.match(/\bblock\s*[:#]?\s*([A-Za-z0-9-]+)/i)?.[1] ?? "";
  const plan = text.match(/\bplan\s*[:#]?\s*([A-Za-z0-9-]+)/i)?.[1] ?? "";
  if (lot || block || plan) return { lot, block, plan };
  const parts = text.split(/[,/|]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { lot: parts[0], block: parts[1], plan: parts[2] };
  }
  return { lot: text, block: "", plan: "" };
}

function displayDate(date?: Date | string | null): string {
  if (!date) return "";
  const formatted = formatDate(date);
  return formatted === "—" ? "" : formatted;
}

function displayMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "";
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates printable HTML for the Sales Information Sheet (browser print / PDF).
 */
export function generateContractHtml(data: PrintableContractData): string {
  const contractDateStr = displayDate(data.contractDate);
  const closingDateStr = displayDate(data.targetClosing || data.firmPossessionDate);
  const parsed = parseLotBlockPlan(data.lotBlockPlan || data.legalAddress);
  const block = data.block || parsed.block;
  const lot = data.lot || parsed.lot;
  const plan = data.plan || parsed.plan;
  const city = data.city || "";
  const gstRebate = data.gstRebate ?? data.discountsTotal ?? 0;
  const purchaserConditions = (data.conditions || []).filter(
    (c) => !c.party || c.party === "purchaser"
  );
  const builderConditions = (data.conditions || []).filter((c) => c.party === "builder");
  const depositsRaw = data.deposits || [];
  const depositByLabel = (label: string) =>
    depositsRaw.find((d) => d.label === label);
  const deposits = [
    depositByLabel("On Signing"),
    depositByLabel("On removal of condition"),
    depositByLabel("By Date 1"),
    depositByLabel("By Date 2"),
    depositByLabel("By Date 3"),
  ];
  const depositPaid = depositsRaw.reduce((sum, d) => sum + (d.amount || 0), 0);
  const balanceClosing = Math.max(0, (data.totalContractPrice || 0) - depositPaid);

  const field = (label: string, value: string, grow = true) =>
    `<div class="form-field${grow ? " grow" : ""}"><span class="form-label">${label}</span><span class="form-value">${escapeHtml(value)}</span></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sales Information Sheet – ${escapeHtml(data.contractNumber)}</title>
  <style>
    @page { size: letter; margin: 14mm 12mm 16mm 12mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827; background: #fff; margin: 0; padding: 0; font-size: 12px; line-height: 1.4;
    }
    .header { display: flex; align-items: center; gap: 28px; margin-bottom: 8px; }
    .header img { height: 48px; width: auto; background: transparent; display: block; }
    .sheet-title { font-size: 22px; font-weight: 700; color: #111827; }
    .section-box {
      border-top: 2px solid #f5c518; border-bottom: 2px solid #f5c518;
      text-align: center; font-size: 13px; font-weight: 700; letter-spacing: 0.3px;
      padding: 6px 8px; margin: 14px 0 16px; color: #111827;
    }
    .form-row { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 12px; }
    .form-field { display: flex; align-items: flex-end; gap: 6px; min-width: 0; }
    .form-field.grow { flex: 1; }
    .form-label { white-space: nowrap; color: #111827; padding-bottom: 3px; }
    .form-value {
      flex: 1; min-width: 40px; background: #e6e9f0; border-bottom: 1.5px solid #222;
      padding: 4px 6px; min-height: 18px; font-weight: 600; color: #111827;
      overflow-wrap: anywhere; word-break: break-word;
    }
    .section-box, .form-row { page-break-inside: avoid; }
    .amp { padding: 0 4px 3px; font-weight: 700; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .two-col .form-row { margin-bottom: 12px; }
    .print-btn-bar {
      background: #111827; color: #fff; padding: 10px 20px; display: flex;
      justify-content: space-between; align-items: center; margin-bottom: 20px; border-radius: 6px;
    }
    .print-btn {
      background: #f5c518; color: #111827; border: none; padding: 8px 16px;
      border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print print-btn-bar">
    <span>SUNBUILD Sales Information Sheet Preview</span>
    <div style="display:flex;gap:10px;">
      <a href="/api/contracts/${escapeHtml(data.contractNumber)}/pdf" style="color:#fff;text-decoration:underline;font-size:13px;">Download PDF File</a>
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>

  <div class="header">
    <img src="/branding/sunview-logo.png" alt="Sunview Custom Homes" />
    <div class="sheet-title">Sales Information Sheet</div>
  </div>

  <div class="section-box">PROPERTY &amp; CONTRACT</div>
  <div class="form-row">
    ${field("Contract #:", data.contractNumber || "")}
    ${field("Contract Date:", contractDateStr)}
    ${field("City:", city)}
  </div>
  <div class="form-row">${field("Municipal Address:", data.municipalAddress || "")}</div>
  <div class="form-row">
    ${field("Block:", block)}
    ${field("Lot:", lot)}
    ${field("Plan:", plan)}
  </div>
  <div class="form-row">${field("Firm Possession Date:", closingDateStr)}</div>
  <div class="form-row">${field("Builder Signature Date:", displayDate(data.builderSignatureDate))}</div>
  <div class="form-row">${field("Purchaser Agreement Receipt Date:", displayDate(data.purchaserAgreementReceiptDate || data.effectiveDate))}</div>

  <div class="section-box">PURCHASERS INFORMATION</div>
  <div class="form-row">
    ${field("Purchaser Name", data.buyerName || "")}
    <span class="amp">&amp;</span>
    <div class="form-field grow"><span class="form-value">${escapeHtml(data.buyer2Name || "")}</span></div>
  </div>
  <div class="form-row">
    ${field("Address", data.buyerAddress || "")}
    <div class="form-field grow"><span class="form-value">${escapeHtml(data.buyer2Address || "")}</span></div>
  </div>
  <div class="form-row">
    ${field("Phone Number", data.buyerPhone || "")}
    <div class="form-field grow"><span class="form-value">${escapeHtml(data.buyer2Phone || "")}</span></div>
  </div>
  <div class="form-row">
    ${field("Email Address", data.buyerEmail || "")}
    <div class="form-field grow"><span class="form-value">${escapeHtml(data.buyer2Email || "")}</span></div>
  </div>
  <div class="form-row">
    ${field("Occupation", data.buyerOccupation || "")}
    <div class="form-field grow"><span class="form-value">${escapeHtml(data.buyer2Occupation || "")}</span></div>
  </div>
  <div class="form-row">
    ${field("ID Number", data.buyerIdNumber || "")}
    <div class="form-field grow"><span class="form-value">${escapeHtml(data.buyer2IdNumber || "")}</span></div>
  </div>
  <div class="form-row">
    ${field("Realtor's Name:", data.realtorName || "")}
    ${field("Phone:", data.realtorPhone || "")}
    ${field("Email:", data.realtorEmail || "")}
  </div>
  <div class="form-row">
    ${field("Lawyer's Name:", data.lawyerName || "")}
    ${field("Phone:", data.lawyerPhone || "")}
    ${field("Email:", data.lawyerEmail || "")}
  </div>

  <div class="section-box">SALE PRICE &amp; TERMS OF PAYMENT</div>
  <div class="two-col">
    <div>
      <div class="form-row">${field("Base Selling Price:", displayMoney(data.basePrice))}</div>
      <div class="form-row">${field("Extra Selections:", displayMoney(data.upgradesTotal))}</div>
      <div class="form-row">${field(`GST ${data.taxRate}%:`, displayMoney(data.taxAmount))}</div>
      <div class="form-row">${field("*Less GST Rebate:", displayMoney(gstRebate))}</div>
      <div class="form-row">${field("TOTAL Purchase Price:", displayMoney(data.totalContractPrice))}</div>
    </div>
    <div>
      <div class="form-row">${field("On Signing:", displayMoney(deposits[0]?.amount))}</div>
      <div class="form-row">${field("On removal of condition:", displayMoney(deposits[1]?.amount))}</div>
      <div class="form-row">${field("By Date :", deposits[2] ? `${displayDate(deposits[2].dueDate)} ${displayMoney(deposits[2].amount)}`.trim() : "")}</div>
      <div class="form-row">${field("By Date :", deposits[3] ? `${displayDate(deposits[3].dueDate)} ${displayMoney(deposits[3].amount)}`.trim() : "")}</div>
      <div class="form-row">${field("By Date :", deposits[4] ? `${displayDate(deposits[4].dueDate)} ${displayMoney(deposits[4].amount)}`.trim() : "")}</div>
      <div class="form-row">${field("Balance on Closing:", displayMoney(balanceClosing))}</div>
    </div>
  </div>

  <div class="section-box">SCHEDULE E – Purchaser &amp; Builder Conditions</div>
  <div class="form-row">${field("Purchaser Condition Date:", displayDate(purchaserConditions[0]?.dueDate))}</div>
  <div class="form-row">${field("Condition 1:", purchaserConditions[0]?.title || "")}</div>
  <div class="form-row">${field("Condition 2:", purchaserConditions[1]?.title || "")}</div>
  <div class="form-row">${field("Builder Condition Date:", displayDate(builderConditions[0]?.dueDate))}</div>
  <div class="form-row">${field("Condition 1:", builderConditions[0]?.title || "")}</div>
  <div class="form-row">${field("Condition 2:", builderConditions[1]?.title || "")}</div>

  <div class="section-box">SCHEDULE B – Change Orders</div>
  ${
    data.changeOrderNotes
      ? `<div class="form-row">${field("Change Order:", data.changeOrderNotes)}</div>`
      : (data.changeOrders || [])
          .slice(0, 6)
          .map((co) => `<div class="form-row">${field(`${co.title}:`, displayMoney(co.amount))}</div>`)
          .join("") || `<div class="form-row">${field("Change Order:", "")}</div>`
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
    @page { size: letter; margin: 18mm 16mm 20mm 16mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827; margin: 0; padding: 0; font-size: 13px; line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #f5c518; padding-bottom: 12px; margin-bottom: 20px;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; display: flex; align-items: center; gap: 12px; }
    .logo img { height: 44px; width: auto; background: transparent; display: block; }
    .logo span { color: #f28c0c; }
    .subtitle { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-number { font-size: 18px; font-weight: 700; text-align: right; }
    .badge-meta { font-size: 11px; color: #6b7280; text-align: right; }
    .meta-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #f9fafb;
      border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px;
    }
    .meta-label { color: #6b7280; font-size: 11px; }
    .meta-val { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th {
      background: #f3f4f6; border-bottom: 2px solid #e5e7eb; padding: 8px 10px; text-align: left;
      font-weight: 600; color: #374151; font-size: 11px; text-transform: uppercase;
    }
    td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
    .text-right { text-align: right; }
    .print-btn-bar {
      background: #111827; color: #fff; padding: 10px 20px; display: flex;
      justify-content: space-between; align-items: center; margin-bottom: 20px; border-radius: 6px;
    }
    .print-btn {
      background: #f5c518; color: #111827; border: none; padding: 8px 16px;
      border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
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
      <div class="meta-val" style="color:#f28c0c;">${formatCurrency(data.totalAllowance)}</div>
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
          <td style="font-weight:600;">${item.category}</td>
          <td>
            <strong>${item.name}</strong>
            ${item.description ? `<div style="font-size:11px;color:#6b7280;">${item.description}</div>` : ""}
          </td>
          <td>${item.location || "—"}</td>
          <td>${item.quantity ? `${item.quantity} ${item.unit || ""}` : "—"}</td>
          <td>${item.selectionDueDate ? formatDate(item.selectionDueDate) : "—"}</td>
          <td class="text-right font-semibold">${formatCurrency(item.amount)}</td>
        </tr>`
        )
        .join("")}
      <tr style="background:#f9fafb;font-weight:700;border-top:2px solid #111827;">
        <td colspan="5">Total Budgeted Allowance (CAD):</td>
        <td class="text-right" style="color:#f28c0c;font-size:14px;">${formatCurrency(data.totalAllowance)}</td>
      </tr>
    </tbody>
  </table>

  ${
    data.notes
      ? `<div style="font-size:11px;color:#6b7280;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
           <strong>Allowance Terms & Notes:</strong><br />${data.notes}
         </div>`
      : ""
  }
</body>
</html>`;
}

/**
 * Sales Information Sheet PDF — matches Sunview client form layout.
 */
export async function generateContractPdfBuffer(
  data: PrintableContractData
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logo = await embedSunviewLogo(pdfDoc);

  const ink = rgb(0.07, 0.09, 0.15);
  const yellow = rgb(0.961, 0.773, 0.094); // #f5c518
  const fieldBg = rgb(0.902, 0.914, 0.941); // #e6e9f0
  const fieldBorder = rgb(0.15, 0.15, 0.15);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginL = 40;
  const marginR = 40;
  const contentW = pageWidth - marginL - marginR;
  const rowGap = 24;
  const fieldH = 14;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 36;

  const ensureSpace = (needed: number) => {
    if (y - needed < 40) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 40;
    }
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(36);
    y -= 10;
    page.drawLine({
      start: { x: marginL, y },
      end: { x: marginL + contentW, y },
      thickness: 1.75,
      color: yellow,
    });
    y -= 14;
    const size = 11;
    const tw = fontBold.widthOfTextAtSize(title, size);
    page.drawText(title, {
      x: marginL + (contentW - tw) / 2,
      y,
      size,
      font: fontBold,
      color: ink,
    });
    y -= 6;
    page.drawLine({
      start: { x: marginL, y },
      end: { x: marginL + contentW, y },
      thickness: 1.75,
      color: yellow,
    });
    // Space below yellow border before the first field row
    y -= 18;
  };

  /** Label + value box (light bg + bottom border) — returns used height via y. */
  const drawField = (
    label: string,
    value: string,
    x: number,
    width: number,
    opts?: { labelSize?: number; valueSize?: number }
  ) => {
    const labelSize = opts?.labelSize ?? 9;
    const valueSize = opts?.valueSize ?? 9;
    const labelText = label.endsWith(":") || !label ? label : `${label}:`;
    const labelW = labelText
      ? fontRegular.widthOfTextAtSize(labelText, labelSize) + 4
      : 0;

    if (labelText) {
      page.drawText(labelText, {
        x,
        y: y + 2,
        size: labelSize,
        font: fontRegular,
        color: ink,
      });
    }

    const boxX = x + labelW;
    const boxW = Math.max(24, width - labelW);
    page.drawRectangle({
      x: boxX,
      y: y - 2,
      width: boxW,
      height: fieldH,
      color: fieldBg,
    });
    page.drawLine({
      start: { x: boxX, y: y - 2 },
      end: { x: boxX + boxW, y: y - 2 },
      thickness: 1.1,
      color: fieldBorder,
    });

    const display = (value || "").slice(0, 90);
    if (display) {
      page.drawText(display, {
        x: boxX + 3,
        y: y + 1,
        size: valueSize,
        font: fontBold,
        color: ink,
        maxWidth: boxW - 6,
      });
    }
  };

  const advanceRow = () => {
    y -= rowGap;
  };

  // ── Header: logo + Sales Information Sheet ──
  let headerBottom = y;
  if (logo) {
    const maxH = 42;
    const scale = maxH / logo.height;
    const logoW = Math.min(logo.width * scale, 200);
    const logoH = logo.height * (logoW / logo.width);
    // No black background — transparent logo on white page
    page.drawImage(logo, {
      x: marginL,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    const title = "Sales Information Sheet";
    const titleSize = 16;
    page.drawText(title, {
      x: marginL + logoW + 18,
      y: y - logoH / 2 - titleSize / 3,
      size: titleSize,
      font: fontBold,
      color: ink,
    });
    headerBottom = y - logoH - 10;
  } else {
    page.drawText("SUNVIEW CUSTOM HOMES", {
      x: marginL,
      y,
      size: 14,
      font: fontBold,
      color: ink,
    });
    page.drawText("Sales Information Sheet", {
      x: marginL + 200,
      y,
      size: 16,
      font: fontBold,
      color: ink,
    });
    headerBottom = y - 22;
  }
  y = headerBottom;

  const parsed = parseLotBlockPlan(data.lotBlockPlan || data.legalAddress);
  const block = data.block || parsed.block;
  const lot = data.lot || parsed.lot;
  const plan = data.plan || parsed.plan;
  const city = data.city || "";
  const depositsRaw = data.deposits || [];
  const depositByLabel = (label: string) =>
    depositsRaw.find((d) => d.label === label);
  const deposits = [
    depositByLabel("On Signing"),
    depositByLabel("On removal of condition"),
    depositByLabel("By Date 1"),
    depositByLabel("By Date 2"),
    depositByLabel("By Date 3"),
  ];
  const gstRebate = data.gstRebate ?? data.discountsTotal ?? 0;
  const purchaserConditions = (data.conditions || []).filter(
    (c) => !c.party || c.party === "purchaser"
  );
  const builderConditions = (data.conditions || []).filter((c) => c.party === "builder");
  const depositPaid = depositsRaw.reduce((sum, d) => sum + (d.amount || 0), 0);
  const balanceClosing = Math.max(0, (data.totalContractPrice || 0) - depositPaid);

  // ── PROPERTY & CONTRACT ──
  drawSectionHeader("PROPERTY & CONTRACT");

  // Contract # | Contract Date | City — one line
  const col3 = (contentW - 16) / 3;
  drawField("Contract #", data.contractNumber || "", marginL, col3);
  drawField("Contract Date", displayDate(data.contractDate), marginL + col3 + 8, col3);
  drawField("City", city, marginL + 2 * (col3 + 8), col3);
  advanceRow();

  // Municipal Address — full width
  drawField("Municipal Address", data.municipalAddress || "", marginL, contentW);
  advanceRow();

  // Block | Lot | Plan — one line
  drawField("Block", block, marginL, col3);
  drawField("Lot", lot, marginL + col3 + 8, col3);
  drawField("Plan", plan, marginL + 2 * (col3 + 8), col3);
  advanceRow();

  drawField(
    "Firm Possession Date",
    displayDate(data.targetClosing || data.firmPossessionDate),
    marginL,
    contentW * 0.55
  );
  advanceRow();
  drawField(
    "Builder Signature Date",
    displayDate(data.builderSignatureDate),
    marginL,
    contentW * 0.55
  );
  advanceRow();
  drawField(
    "Purchaser Agreement Receipt Date",
    displayDate(data.purchaserAgreementReceiptDate || data.effectiveDate),
    marginL,
    contentW * 0.65
  );
  advanceRow();

  // ── PURCHASERS INFORMATION ──
  drawSectionHeader("PURCHASERS INFORMATION");

  const half = (contentW - 28) / 2;
  drawField("Purchaser Name", data.buyerName || "", marginL, half);
  const ampX = marginL + half + 6;
  page.drawText("&", { x: ampX, y: y + 2, size: 11, font: fontBold, color: ink });
  drawField("", data.buyer2Name || "", ampX + 14, half);
  advanceRow();

  drawField("Address", data.buyerAddress || "", marginL, half);
  drawField("", data.buyer2Address || "", ampX + 14, half);
  advanceRow();

  drawField("Phone Number", data.buyerPhone || "", marginL, half);
  drawField("", data.buyer2Phone || "", ampX + 14, half);
  advanceRow();

  drawField("Email Address", data.buyerEmail || "", marginL, half);
  drawField("", data.buyer2Email || "", ampX + 14, half);
  advanceRow();

  drawField("Occupation", data.buyerOccupation || "", marginL, half);
  drawField("", data.buyer2Occupation || "", ampX + 14, half);
  advanceRow();

  drawField("ID Number", data.buyerIdNumber || "", marginL, half);
  drawField("", data.buyer2IdNumber || "", ampX + 14, half);
  advanceRow();

  const nameW = contentW * 0.38;
  const phoneW = contentW * 0.28;
  const emailW = contentW - nameW - phoneW - 16;
  drawField("Realtor's Name", data.realtorName || "", marginL, nameW);
  drawField("Phone", data.realtorPhone || "", marginL + nameW + 8, phoneW);
  drawField("Email", data.realtorEmail || "", marginL + nameW + phoneW + 16, emailW);
  advanceRow();
  drawField("Lawyer's Name", data.lawyerName || "", marginL, nameW);
  drawField("Phone", data.lawyerPhone || "", marginL + nameW + 8, phoneW);
  drawField("Email", data.lawyerEmail || "", marginL + nameW + phoneW + 16, emailW);
  advanceRow();

  // ── SALE PRICE & TERMS OF PAYMENT ──
  drawSectionHeader("SALE PRICE & TERMS OF PAYMENT");

  const leftX = marginL;
  const rightX = marginL + contentW / 2 + 10;
  const colW = contentW / 2 - 10;

  const leftRows: Array<[string, string]> = [
    ["Base Selling Price", displayMoney(data.basePrice)],
    ["Extra Selections", displayMoney(data.upgradesTotal)],
    [`GST ${data.taxRate}%`, displayMoney(data.taxAmount)],
    ["*Less GST Rebate", displayMoney(gstRebate)],
    ["TOTAL Purchase Price", displayMoney(data.totalContractPrice)],
  ];
  const rightRows: Array<[string, string]> = [
    ["On Signing", displayMoney(deposits[0]?.amount)],
    ["On removal of condition", displayMoney(deposits[1]?.amount)],
    [
      "By Date ",
      deposits[2]
        ? `${displayDate(deposits[2].dueDate)} ${displayMoney(deposits[2].amount)}`.trim()
        : "",
    ],
    [
      "By Date ",
      deposits[3]
        ? `${displayDate(deposits[3].dueDate)} ${displayMoney(deposits[3].amount)}`.trim()
        : "",
    ],
    [
      "By Date ",
      deposits[4]
        ? `${displayDate(deposits[4].dueDate)} ${displayMoney(deposits[4].amount)}`.trim()
        : "",
    ],
    ["Balance on Closing", displayMoney(balanceClosing)],
  ];

  const maxRows = Math.max(leftRows.length, rightRows.length);
  for (let i = 0; i < maxRows; i++) {
    ensureSpace(rowGap + 4);
    if (leftRows[i]) drawField(leftRows[i][0], leftRows[i][1], leftX, colW);
    if (rightRows[i]) drawField(rightRows[i][0], rightRows[i][1], rightX, colW);
    advanceRow();
  }

  // ── SCHEDULE E ──
  drawSectionHeader("SCHEDULE E – Purchaser & Builder Conditions");
  drawField(
    "Purchaser Condition Date",
    displayDate(purchaserConditions[0]?.dueDate),
    marginL,
    contentW * 0.5
  );
  advanceRow();
  drawField("Condition 1", purchaserConditions[0]?.title || "", marginL, contentW);
  advanceRow();
  drawField("Condition 2", purchaserConditions[1]?.title || "", marginL, contentW);
  advanceRow();
  drawField(
    "Builder Condition Date",
    displayDate(builderConditions[0]?.dueDate),
    marginL,
    contentW * 0.5
  );
  advanceRow();
  drawField("Condition 1", builderConditions[0]?.title || "", marginL, contentW);
  advanceRow();
  drawField("Condition 2", builderConditions[1]?.title || "", marginL, contentW);
  advanceRow();

  // ── SCHEDULE B ──
  drawSectionHeader("SCHEDULE B – Change Orders");
  if (data.changeOrderNotes) {
    drawField("Change Order", data.changeOrderNotes, marginL, contentW);
    advanceRow();
  } else {
    const cos = data.changeOrders || [];
    if (cos.length === 0) {
      drawField("Change Order", "", marginL, contentW);
      advanceRow();
    } else {
      for (const co of cos.slice(0, 8)) {
        ensureSpace(rowGap + 4);
        drawField(co.title || "Change Order", displayMoney(co.amount), marginL, contentW);
        advanceRow();
      }
    }
  }

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
  const logo = await embedSunviewLogo(pdfDoc);

  const primaryColor = rgb(0.961, 0.773, 0.094);
  const inkColor = rgb(0.067, 0.094, 0.153);
  const mutedColor = rgb(0.42, 0.447, 0.502);

  let y = 750;

  if (logo) {
    const maxH = 40;
    const scale = maxH / logo.height;
    const logoW = Math.min(logo.width * scale, 190);
    const logoH = logo.height * (logoW / logo.width);
    page.drawImage(logo, {
      x: 50,
      y: y - logoH,
      width: logoW,
      height: logoH,
    });
    page.drawText(`SOA: ${data.soaNumber}`, {
      x: 400,
      y: y - 12,
      size: 14,
      font: fontBold,
      color: inkColor,
    });
    y -= logoH + 12;
  } else {
    page.drawText("SUNVIEW CUSTOM HOMES", {
      x: 50,
      y,
      size: 18,
      font: fontBold,
      color: primaryColor,
    });
    page.drawText(`SOA: ${data.soaNumber}`, {
      x: 400,
      y,
      size: 14,
      font: fontBold,
      color: inkColor,
    });
    y -= 16;
  }

  page.drawText("Schedule of Allowances", {
    x: 50,
    y,
    size: 10,
    font: fontRegular,
    color: mutedColor,
  });
  page.drawText(`Contract #${data.contractNumber} · Version ${data.version}`, {
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

  y -= 30;
  page.drawText(`Client: ${data.clientName}`, {
    x: 50,
    y,
    size: 10,
    font: fontRegular,
    color: inkColor,
  });
  page.drawText(`Property: ${data.propertyAddress || "—"}`, {
    x: 260,
    y,
    size: 10,
    font: fontRegular,
    color: inkColor,
  });
  page.drawText(`Total: ${formatCurrency(data.totalAllowance)}`, {
    x: 460,
    y,
    size: 10,
    font: fontBold,
    color: primaryColor,
  });

  y -= 24;
  page.drawText("CATEGORY", { x: 50, y, size: 9, font: fontBold, color: mutedColor });
  page.drawText("ALLOWANCE ITEM", { x: 180, y, size: 9, font: fontBold, color: mutedColor });
  page.drawText("LOCATION", { x: 360, y, size: 9, font: fontBold, color: mutedColor });
  page.drawText("AMOUNT", { x: 480, y, size: 9, font: fontBold, color: mutedColor });

  y -= 6;
  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 1,
    color: rgb(0.898, 0.906, 0.922),
  });

  for (const item of data.items) {
    y -= 18;
    if (y < 60) break;
    page.drawText(item.category.slice(0, 20), {
      x: 50,
      y,
      size: 9,
      font: fontBold,
      color: inkColor,
    });
    page.drawText(item.name.slice(0, 30), {
      x: 180,
      y,
      size: 9,
      font: fontRegular,
      color: inkColor,
    });
    page.drawText((item.location || "—").slice(0, 16), {
      x: 360,
      y,
      size: 9,
      font: fontRegular,
      color: mutedColor,
    });
    page.drawText(formatCurrency(item.amount), {
      x: 480,
      y,
      size: 9,
      font: fontBold,
      color: inkColor,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
