import { NextRequest, NextResponse } from "next/server";
import {
  getWhatsAppAppSecret,
  getWhatsAppVerifyToken,
} from "@/lib/whatsapp/config";
import { handleWhatsAppWebhookPayload } from "@/lib/whatsapp/service";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/webhook-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Meta WhatsApp Cloud API Webhook Verification.
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = getWhatsAppVerifyToken();

  // Reject handshake when verify token is not configured (no hardcoded fallback).
  if (!expectedToken) {
    return NextResponse.json(
      { error: "WhatsApp webhook verify token is not configured" },
      { status: 503 }
    );
  }

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
 * Requires X-Hub-Signature-256 verified against WHATSAPP_APP_SECRET.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = getWhatsAppAppSecret();

  if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    await handleWhatsAppWebhookPayload(payload);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    // Ack 200 so Meta does not retry forever on handler bugs; log for ops.
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json(
      { success: true, processedWithError: true },
      { status: 200 }
    );
  }
}
