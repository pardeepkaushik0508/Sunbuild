import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { startMfaEnrollment } from "@/lib/mfa/start-enrollment";
import { AppError, toSafeErrorMessage } from "@/lib/errors";

/**
 * Start MFA enrollment for the current session (no password re-prompt).
 */
export async function POST() {
  try {
    const session = await requireApiSession();
    const result = await startMfaEnrollment({
      id: session.user.id,
      email: session.user.email,
    });
    return NextResponse.json({
      method: "totp",
      totpURI: result.totpURI,
      backupCodes: result.backupCodes,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status }
      );
    }
    return NextResponse.json(
      { error: toSafeErrorMessage(e) },
      { status: 500 }
    );
  }
}
