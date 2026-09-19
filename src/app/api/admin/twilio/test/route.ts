import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";
import { sendTrialSmsToCompanyUser } from "@/lib/twilio/service";
import { sendTwilioWhatsApp } from "@/lib/twilio/whatsapp";
import { isTwilioTrialMode } from "@/lib/twilio/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_LIMIT = 5;

function testEndpointEnabled(): boolean {
  if (process.env.TWILIO_TEST_ENDPOINT_ENABLED?.trim() === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Owner-only diagnostic send. Never accepts an arbitrary public phone.
 * Disabled in production unless TWILIO_TEST_ENDPOINT_ENABLED=true.
 */
export async function POST(request: NextRequest) {
  try {
    if (!testEndpointEnabled()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await requireApiSession();
    if (session.membership.role !== Role.OWNER) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    assertRateLimit(
      clientKeyFromHeaders(request.headers, `admin-twilio-test:${session.user.id}`),
      TEST_LIMIT,
      ACTION_RATE.windowMs
    );

    const payload = (await request.json().catch(() => null)) as {
      channel?: string;
      userId?: string;
    } | null;

    const channel = (payload?.channel || "").toUpperCase();
    if (channel !== "SMS" && channel !== "WHATSAPP") {
      return NextResponse.json(
        { error: "channel must be SMS or WHATSAPP" },
        { status: 400 }
      );
    }

    const targetUserId = payload?.userId?.trim() || session.user.id;

    if (channel === "SMS") {
      const result = await sendTrialSmsToCompanyUser({
        session,
        userId: targetUserId,
        request,
      });
      return NextResponse.json({
        success: result.success,
        channel: "SMS",
        twilioSid: result.twilioSid,
        status: result.status,
        toDisplay: result.toDisplay,
        trialTemplate: result.trialTemplate,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        trial: isTwilioTrialMode(),
      });
    }

    await sendTwilioWhatsApp({
      recipientUserId: targetUserId,
      companyId: session.membership.companyId,
      eventType: "ADMIN_TEST",
      entityType: "User",
      entityId: targetUserId,
      body: "SUNBUILD diagnostic WhatsApp (trial uses the pre-approved ContentSid).",
      occurrence: new Date().toISOString().slice(0, 16),
    });

    return NextResponse.json({
      success: true,
      channel: "WHATSAPP",
      trial: isTwilioTrialMode(),
      note: "Delivery is recorded in CommunicationDelivery. Trial uses TWILIO_WHATSAPP_TEST_CONTENT_SID, not production copy.",
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 400;
    return NextResponse.json(
      {
        error: toSafeErrorMessage(error),
        code: error instanceof AppError ? error.code : undefined,
      },
      { status }
    );
  }
}
