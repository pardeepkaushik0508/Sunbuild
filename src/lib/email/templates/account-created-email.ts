import "server-only";

import { escapeHtml } from "@/lib/email/escape";
import {
  renderBaseEmail,
  renderCtaButton,
} from "@/lib/email/templates/base-template";

/**
 * Account / invite notification.
 * Prefer a set-password link so invitees can activate without out-of-band temp passwords.
 * Temporary passwords are never included in email bodies.
 */
export function accountCreatedEmail(input: {
  userName: string;
  companyName: string;
  roleLabel: string;
  loginUrl: string;
  invitedByName?: string | null;
  /** Better Auth password-setup URL (preferred CTA). */
  setupPasswordUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(input.userName.trim() || "there");
  const company = escapeHtml(input.companyName);
  const role = escapeHtml(input.roleLabel);
  const invitedBy = input.invitedByName
    ? escapeHtml(input.invitedByName)
    : null;
  const subject = `Your Sunbuild account for ${input.companyName}`;
  const hasSetup = Boolean(input.setupPasswordUrl);

  const bodyHtml = `
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">Hi ${name},</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
  ${
    invitedBy
      ? `${invitedBy} created a Sunbuild account for you at <strong>${company}</strong>.`
      : `A Sunbuild account was created for you at <strong>${company}</strong>.`
  }
  Your role is <strong>${role}</strong>.
</p>
${
  hasSetup
    ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
  Use the button below to set your password and sign in. This link expires in 48 hours and can only be used once.
</p>
${renderCtaButton(input.setupPasswordUrl!, "Set your password")}
<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#6b7280;">
  After setting your password, you can always sign in at <a href="${escapeHtml(input.loginUrl)}" style="color:#f97316;">${escapeHtml(input.loginUrl)}</a>.
</p>`
    : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
  Sign in with the email address this message was sent to. If your administrator shared a temporary password, use it to sign in, then change it after login.
  You can also use <strong>Forgot password</strong> on the login page to set your own password securely.
</p>
${renderCtaButton(input.loginUrl, "Open Sunbuild login")}`
}
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
  For security, temporary passwords are never sent by email.
</p>`;

  const html = renderBaseEmail({
    title: "Welcome to Sunbuild",
    preheader: `Your account for ${input.companyName} is ready`,
    bodyHtml,
  });

  const text = [
    `Hi ${input.userName.trim() || "there"},`,
    "",
    invitedBy
      ? `${input.invitedByName} created a Sunbuild account for you at ${input.companyName}.`
      : `A Sunbuild account was created for you at ${input.companyName}.`,
    `Role: ${input.roleLabel}`,
    "",
    hasSetup
      ? `Set your password: ${input.setupPasswordUrl}`
      : `Sign in: ${input.loginUrl}`,
    "",
    `Login page: ${input.loginUrl}`,
    "",
    "Temporary passwords are never sent by email.",
  ].join("\n");

  return { subject, html, text };
}
