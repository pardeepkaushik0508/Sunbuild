import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "@/lib/errors";

const STATE_TTL_MS = 15 * 60 * 1000;

type OAuthStatePayload = {
  userId: string;
  companyId: string;
  nonce: string;
  exp: number;
  returnTo?: string;
};

function stateSecret(): string {
  const secret =
    process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";
  if (!secret) {
    throw new AppError("Auth secret is not configured", 500, "CONFIG");
  }
  return secret;
}

function sign(body: string): string {
  return createHmac("sha256", stateSecret()).update(body).digest("base64url");
}

export function createOAuthState(input: {
  userId: string;
  companyId: string;
  returnTo?: string;
}): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    companyId: input.companyId,
    nonce: createHmac("sha256", stateSecret())
      .update(`${input.userId}:${Date.now()}:${Math.random()}`)
      .digest("hex")
      .slice(0, 24),
    exp: Date.now() + STATE_TTL_MS,
    returnTo: input.returnTo,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${body}.${sign(body)}`;
}

export function parseAndVerifyOAuthState(state: string): OAuthStatePayload {
  const [body, sig] = state.split(".");
  if (!body || !sig) {
    throw new AppError("Invalid OAuth state", 400, "OAUTH_STATE");
  }
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("Invalid OAuth state signature", 400, "OAUTH_STATE");
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as OAuthStatePayload;
  } catch {
    throw new AppError("Invalid OAuth state payload", 400, "OAUTH_STATE");
  }
  if (!payload.userId || !payload.companyId || !payload.exp) {
    throw new AppError("Incomplete OAuth state", 400, "OAUTH_STATE");
  }
  if (Date.now() > payload.exp) {
    throw new AppError("OAuth state expired. Please try connecting again.", 400, "OAUTH_STATE");
  }
  return payload;
}

export function safeReturnPath(returnTo: string | undefined, fallback: string): string {
  if (!returnTo) return fallback;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  if (returnTo.includes("://")) return fallback;
  return returnTo;
}
