import { NextRequest } from "next/server";
import {
  assertValidTwilioRequest,
  emptyTwiml,
  readTwilioFormParams,
  twilioForbidden,
} from "@/lib/twilio/webhook";
import { getTwilioRequestUrl } from "@/lib/twilio/webhooks";
import { storeInboundSms } from "@/lib/twilio/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio inbound SMS webhook.
 * Public URL: ${APP_URL}/api/twilio/inbound
 *
 * Configure this URL on the Twilio phone number or Messaging Service.
 * Do not point Twilio at a second domain or a separate API server.
 */
export async function POST(request: NextRequest) {
  const params = await readTwilioFormParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const publicUrl = getTwilioRequestUrl(request);

  if (!assertValidTwilioRequest(signature, publicUrl, params)) {
    return twilioForbidden();
  }

  try {
    await storeInboundSms(params);
  } catch (error) {
    console.error("[twilio] inbound webhook error", error);
  }

  return emptyTwiml();
}
