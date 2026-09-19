import { NextRequest } from "next/server";
import {
  assertValidTwilioRequest,
  emptyTwiml,
  readTwilioFormParams,
  twilioForbidden,
} from "@/lib/twilio/webhook";
import { getTwilioRequestUrl } from "@/lib/twilio/webhooks";
import { storeInboundWhatsApp } from "@/lib/twilio/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio incoming WhatsApp webhook.
 * Public URL: ${APP_URL}/api/twilio/whatsapp/incoming
 *
 * Stores the conversation. Does NOT auto-create warranty tickets.
 */
export async function POST(request: NextRequest) {
  const params = await readTwilioFormParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const publicUrl = getTwilioRequestUrl(request);

  if (!assertValidTwilioRequest(signature, publicUrl, params)) {
    return twilioForbidden();
  }

  try {
    await storeInboundWhatsApp(params);
  } catch (error) {
    console.error("[twilio] WhatsApp incoming webhook error", error);
  }

  return emptyTwiml();
}
