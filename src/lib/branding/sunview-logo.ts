import { readFile } from "fs/promises";
import path from "path";
import type { PDFDocument, PDFImage } from "pdf-lib";

/** Canonical Sunview logo for PDF letterheads (Statement of Adjustments, contracts). */
export const SUNVIEW_LOGO_PUBLIC_PATH = "branding/sunview-logo.png";

export async function loadSunviewLogoBytes(): Promise<Uint8Array | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      SUNVIEW_LOGO_PUBLIC_PATH
    );
    const buf = await readFile(filePath);
    return new Uint8Array(buf);
  } catch {
    console.warn("[branding] sunview logo not found at public/branding/sunview-logo.png");
    return null;
  }
}

export async function embedSunviewLogo(
  pdfDoc: PDFDocument
): Promise<PDFImage | null> {
  const bytes = await loadSunviewLogoBytes();
  if (!bytes) return null;
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      console.warn("[branding] failed to embed sunview logo");
      return null;
    }
  }
}

export function sunviewLogoHtmlImg(opts?: { height?: number }) {
  const h = opts?.height ?? 48;
  return `<img src="/${SUNVIEW_LOGO_PUBLIC_PATH}" alt="Sunview Custom Homes" style="height:${h}px;width:auto;display:block;" />`;
}
