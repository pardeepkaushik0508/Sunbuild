import { NextRequest, NextResponse } from "next/server";
import {
  assertValidTwilioRequest,
  readTwilioFormParams,
  twilioForbidden,
} from "@/lib/twilio/webhook";
import { getTwilioRequestUrl } from "@/lib/twilio/webhooks";
import { applyTwilioStatusCallback } from "@/lib/twilio/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio WhatsApp delivery StatusCallback.
 * Public URL: ${APP_URL}/api/twilio/whatsapp/status
 */
export async function POST(request: NextRequest) {
  const params = await readTwilioFormParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const publicUrl = getTwilioRequestUrl(request);

  if (!assertValidTwilioRequest(signature, publicUrl, params)) {
    return twilioForbidden();
  }

  try {
    await applyTwilioStatusCallback(params);
  } catch (error) {
    console.error("[twilio] WhatsApp status callback error", error);
  }

  return new NextResponse(null, { status: 204 });
}
