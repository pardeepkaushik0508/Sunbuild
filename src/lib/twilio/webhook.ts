import "server-only";

import { NextResponse } from "next/server";
import { getTwilioAuthConfig } from "@/lib/twilio/config";
import { validateTwilioSignature } from "@/lib/twilio/client";

export type TwilioFormParams = Record<string, string>;

export async function readTwilioFormParams(
  request: Request
): Promise<TwilioFormParams> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") return {};
    const out: TwilioFormParams = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") {
        out[key] = String(value);
      }
    }
    return out;
  }

  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const params: TwilioFormParams = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  return params;
}

/**
 * Validate X-Twilio-Signature against the public APP_URL path Twilio was given.
 * Using request.url is unsafe on Render (internal listen origin / PORT).
 */
export function assertValidTwilioRequest(
  signature: string | null,
  publicUrl: string,
  params: TwilioFormParams
): boolean {
  const config = getTwilioAuthConfig();
  if (!config) return false;
  if (!signature) return false;
  return validateTwilioSignature(config.authToken, signature, publicUrl, params);
}

export function twilioForbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function emptyTwiml() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    }
  );
}
