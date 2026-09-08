import "server-only";

import { createOTP } from "@better-auth/utils/otp";
import {
  generateRandomString,
  symmetricEncrypt,
} from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

const ISSUER = "Sunbuild CRM";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

function authSecret(): string {
  const secret =
    process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";
  if (!secret) {
    throw new AppError("Auth secret is not configured", 500, "CONFIG");
  }
  return secret;
}

function generatePlainBackupCodes(amount = 10, length = 10): string[] {
  return Array.from({ length: amount }, () => {
    const code = generateRandomString(length, "a-z", "0-9", "A-Z");
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

/**
 * Start TOTP enrollment for an already-authenticated session.
 * Mirrors Better Auth's enable flow without password re-prompt
 * (user just signed in with email/password).
 */
export async function startMfaEnrollment(user: {
  id: string;
  email: string;
}): Promise<{ totpURI: string; backupCodes: string[] }> {
  const existing = await prisma.twoFactor.findFirst({
    where: { userId: user.id },
  });

  if (existing?.verified) {
    throw new AppError("MFA is already enabled", 400, "TOTP_ALREADY_ENABLED");
  }

  const secret = authSecret();
  const totpSecret = generateRandomString(32);
  const backupCodes = generatePlainBackupCodes();
  const encryptedSecret = await symmetricEncrypt({
    key: secret,
    data: totpSecret,
  });
  const encryptedBackupCodes = await symmetricEncrypt({
    key: secret,
    data: JSON.stringify(backupCodes),
  });

  const totpData = {
    secret: encryptedSecret,
    backupCodes: encryptedBackupCodes,
    verified: false,
    failedVerificationCount: 0,
    lockedUntil: null,
  };

  if (existing) {
    await prisma.twoFactor.update({
      where: { id: existing.id },
      data: totpData,
    });
  } else {
    await prisma.twoFactor.create({
      data: {
        ...totpData,
        userId: user.id,
      },
    });
  }

  const totpURI = createOTP(totpSecret, {
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  }).url(ISSUER, user.email);

  return { totpURI, backupCodes };
}
