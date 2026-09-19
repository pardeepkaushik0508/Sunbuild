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
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { maskPhone } from "@/lib/twilio/phone";

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

    const membership = await prisma.membership.findFirst({
      where: {
        companyId: session.membership.companyId,
        userId: targetUserId,
        isActive: true,
      },
      select: { user: { select: { id: true, phone: true } } },
    });
    if (!membership?.user) {
      return NextResponse.json(
        { error: "User not found in this company" },
        { status: 404 }
      );
    }

    const occurrence = new Date().toISOString().slice(0, 16);
    await sendTwilioWhatsApp({
      recipientUserId: targetUserId,
      companyId: session.membership.companyId,
      eventType: "ADMIN_TEST",
      entityType: "User",
      entityId: targetUserId,
      body: "SUNBUILD diagnostic WhatsApp (trial uses the pre-approved ContentSid).",
      occurrence,
    });

    const delivery = await prisma.communicationDelivery.findFirst({
      where: {
        companyId: session.membership.companyId,
        recipientUserId: targetUserId,
        eventType: "ADMIN_TEST",
        channel: "WHATSAPP",
      },
      orderBy: { createdAt: "desc" },
      select: {
        twilioMessageSid: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        toNumber: true,
        contentSid: true,
      },
    });

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "whatsapp.admin_test",
      entityType: "User",
      entityId: targetUserId,
      metadata: {
        to: maskPhone(delivery?.toNumber || membership.user.phone),
        twilioSid: delivery?.twilioMessageSid ?? null,
        status: delivery?.status ?? null,
        errorCode: delivery?.errorCode ?? null,
      },
    });

    const success =
      Boolean(delivery?.twilioMessageSid) &&
      delivery?.status !== "FAILED" &&
      delivery?.status !== "UNDELIVERED" &&
      delivery?.status !== "NOT_CONFIGURED" &&
      delivery?.status !== "INVALID_PHONE" &&
      delivery?.status !== "SKIPPED";

    return NextResponse.json({
      success,
      channel: "WHATSAPP",
      twilioSid: delivery?.twilioMessageSid ?? null,
      status: delivery?.status ?? null,
      toDisplay: maskPhone(delivery?.toNumber || membership.user.phone),
      contentSidUsed: Boolean(delivery?.contentSid),
      errorCode: delivery?.errorCode ?? null,
      errorMessage: delivery?.errorMessage ?? null,
      trial: isTwilioTrialMode(),
      note: "Trial uses TWILIO_WHATSAPP_TEST_CONTENT_SID, not production SUNBUILD copy.",
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
