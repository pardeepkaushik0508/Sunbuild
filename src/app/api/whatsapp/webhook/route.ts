import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { handleWhatsAppWebhookPayload } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Cloud API Webhook Verification.
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = getWhatsAppConfig();
  const expectedToken = config?.verifyToken || "sunbuild_whatsapp_verify";

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Meta WhatsApp Cloud API Webhook Event Listener.
 * Receives incoming messages and message status updates (delivered, read, failed).
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    await handleWhatsAppWebhookPayload(payload);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    // Return 200 to acknowledge receipt to Meta to prevent retry loops
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json({ success: true, processedWithError: true }, { status: 200 });
  }
}
