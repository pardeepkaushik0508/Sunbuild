import "server-only";

import { escapeHtml } from "@/lib/email/escape";
import {
  renderBaseEmail,
  renderCtaButton,
} from "@/lib/email/templates/base-template";

export function passwordResetEmail(input: {
  userName: string;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.userName.trim() || "there");
  const subject = "Reset your Sunbuild password";

  const bodyHtml = `
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">Hi ${name},</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
  We received a request to reset your Sunbuild account password. Use the button below to choose a new password.
  This link expires soon and can only be used once.
</p>
${renderCtaButton(input.resetUrl, "Reset password")}
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
  If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
</p>`;

  const html = renderBaseEmail({
    title: "Password reset",
    preheader: "Reset your Sunbuild password",
    bodyHtml,
  });

  const text = [
    `Hi ${input.userName.trim() || "there"},`,
    "",
    "We received a request to reset your Sunbuild password.",
    `Open this link to choose a new password: ${input.resetUrl}`,
    "",
    "If you did not request this, ignore this email.",
  ].join("\n");

  return { subject, html, text };
}
