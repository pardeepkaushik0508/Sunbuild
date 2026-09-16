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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_TEST_LIMIT = 5;

/**
 * Owner-only trial SMS test against an existing company user.
 * Never exposes Twilio secrets. Destination must be a directory user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    if (session.membership.role !== Role.OWNER) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    assertRateLimit(
      clientKeyFromHeaders(request.headers, `twilio-trial-test:${session.user.id}`),
      TRIAL_TEST_LIMIT,
      ACTION_RATE.windowMs
    );

    const payload = (await request.json().catch(() => null)) as {
      userId?: string;
    } | null;

    if (!payload?.userId?.trim()) {
      return NextResponse.json(
        { error: "userId is required (existing company user)" },
        { status: 400 }
      );
    }

    const result = await sendTrialSmsToCompanyUser({
      session,
      userId: payload.userId.trim(),
      request,
    });

    return NextResponse.json({
      success: result.success,
      twilioSid: result.twilioSid,
      status: result.status,
      toDisplay: result.toDisplay,
      trialTemplate: result.trialTemplate,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
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
