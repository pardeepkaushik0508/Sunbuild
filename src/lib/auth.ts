import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import {
  isSmtpConfigured,
  passwordResetEmail,
  trySendEmail,
} from "@/lib/email";

const isProd = process.env.NODE_ENV === "production";

const baseURL = (
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

/**
 * Password reset email delivery via Better Auth token URL.
 * Tokens are created & expired by Better Auth; we never log the token/URL in production.
 */
async function sendResetPasswordEmail({
  user,
  url,
}: {
  user: { email: string; name: string };
  url: string;
}) {
  if (!isSmtpConfigured()) {
    if (!isProd) {
      console.info(
        `[auth] password reset for ${user.email} — SMTP not configured; dev reset URL:`
      );
      console.info(`[auth:dev] reset URL: ${url}`);
    } else {
      console.error(
        "[auth] password reset requested but SMTP is not configured"
      );
    }
    return;
  }

  const template = passwordResetEmail({
    userName: user.name,
    resetUrl: url,
  });

  const result = await trySendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: { type: "password_reset" },
  });

  if (!result.success) {
    console.error("[auth] password reset email failed:", result.message);
    // Dev fallback so local QA is not blocked when SMTP credentials are wrong.
    if (!isProd) {
      console.info(
        `[auth:dev] SMTP send failed — use this reset URL for ${user.email}:`
      );
      console.info(`[auth:dev] reset URL: ${url}`);
    }
    return;
  }

  if (!isProd) {
    console.info(`[auth] password reset email sent to ${user.email}`);
  } else {
    console.info("[auth] password reset email sent");
  }
}

/**
 * Absolute session lifetime (cookie). Idle timeout is company-configurable
 * and enforced by SessionTimeoutGuard (max option 8 hours).
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [baseURL, process.env.NEXT_PUBLIC_APP_URL].filter(
    (v): v is string => Boolean(v)
  ),
  emailAndPassword: {
    enabled: true,
    // Floor; company password policy may require more via app validation.
    minPasswordLength: 8,
    disableSignUp: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendResetPasswordEmail,
    resetPasswordTokenExpiresIn: 60 * 60,
  },
  user: {
    additionalFields: {
      phone: {
        type: "string",
        required: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [
    twoFactor({
      issuer: "Sunbuild CRM",
      totpOptions: {
        digits: 6,
        period: 30,
      },
    }),
  ],
  advanced: {
    useSecureCookies: isProd,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  phone?: string | null;
};
