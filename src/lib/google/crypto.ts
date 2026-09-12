import "server-only";

import {
  symmetricDecrypt,
  symmetricEncrypt,
} from "better-auth/crypto";
import { AppError } from "@/lib/errors";

function authSecret(): string {
  const secret =
    process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";
  if (!secret) {
    throw new AppError("Auth secret is not configured", 500, "CONFIG");
  }
  return secret;
}

/** Encrypt a sensitive token for DB storage. Never log the plaintext. */
export async function encryptSecret(plaintext: string): Promise<string> {
  return symmetricEncrypt({ key: authSecret(), data: plaintext });
}

/** Decrypt a token stored via encryptSecret. */
export async function decryptSecret(ciphertext: string): Promise<string> {
  return symmetricDecrypt({ key: authSecret(), data: ciphertext });
}
