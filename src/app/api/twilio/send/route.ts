import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";
import { sendSmsMessage } from "@/lib/twilio/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SMS_SEND_LIMIT = 20;

/**
 * Same-origin send endpoint.
 * Browser: fetch("/api/twilio/send") — never hardcode the production host.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    assertRateLimit(
      clientKeyFromHeaders(request.headers, `twilio-send:${session.user.id}`),
      SMS_SEND_LIMIT,
      ACTION_RATE.windowMs
    );

    const payload = (await request.json().catch(() => null)) as {
      to?: string;
      body?: string;
      leadId?: string;
      projectId?: string;
    } | null;

    if (!payload?.body) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 }
      );
    }

    const message = await sendSmsMessage({
      session,
      to: payload.to,
      body: payload.body,
      leadId: payload.leadId,
      projectId: payload.projectId,
      request,
    });

    const delivered =
      message.status !== "FAILED" && message.status !== "UNDELIVERED";
    return NextResponse.json({
      success: delivered,
      message,
      diagnostic: message.unverifiedRecipient
        ? message.errorMessage
        : undefined,
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 400;
    return NextResponse.json(
      { error: toSafeErrorMessage(error) },
      { status }
    );
  }
}
