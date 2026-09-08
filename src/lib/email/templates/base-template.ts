import "server-only";

import { escapeHtml } from "@/lib/email/escape";

export type BaseEmailContent = {
  title: string;
  preheader?: string;
  bodyHtml: string;
  footerNote?: string;
};

/**
 * Email-safe Sunbuild layout (inline styles, no external JS).
 */
export function renderBaseEmail(content: BaseEmailContent): string {
  const brand = escapeHtml(process.env.SMTP_FROM_NAME?.trim() || "Sunbuild");
  const title = escapeHtml(content.title);
  const preheader = escapeHtml(content.preheader || content.title);
  const footer = escapeHtml(
    content.footerNote ||
      "This message was sent by Sunbuild. If you did not expect it, you can ignore this email."
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#111827;padding:20px 24px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#f97316;letter-spacing:0.02em;">${brand}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827;">${title}</h1>
              ${content.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderCtaButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<p style="margin:24px 0;">
  <a href="${safeHref}" style="display:inline-block;background-color:#f97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">${safeLabel}</a>
</p>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">Or open this link:<br />${safeHref}</p>`;
}
