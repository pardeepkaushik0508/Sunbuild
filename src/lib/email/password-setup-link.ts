import "server-only";

import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { getAppOrigin } from "@/lib/app-url";

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

  const origin = getAppOrigin();
  const callbackURL = encodeURIComponent(`${origin}${callbackPath}`);
  // Better Auth serves reset-password under /api/auth
  return `${origin}/api/auth/reset-password/${token}?callbackURL=${callbackURL}`;
}
