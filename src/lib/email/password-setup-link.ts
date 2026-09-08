import "server-only";

import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";

function appOrigin(): string {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Create a Better Auth–compatible password reset token and return the
 * callback URL that lands on `/reset-password?token=…`.
 */
export async function createPasswordSetupLink(
  userId: string,
  opts?: { expiresInSec?: number; callbackPath?: string }
): Promise<string> {
  const expiresInSec = opts?.expiresInSec ?? 60 * 60 * 48; // 48h for invites
  const callbackPath = opts?.callbackPath ?? "/reset-password";
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);

  await prisma.verification.create({
    data: {
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt,
    },
  });

  const origin = appOrigin();
  const callbackURL = encodeURIComponent(`${origin}${callbackPath}`);
  // Better Auth serves reset-password under /api/auth
  return `${origin}/api/auth/reset-password/${token}?callbackURL=${callbackURL}`;
}
