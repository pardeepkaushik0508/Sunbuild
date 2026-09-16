import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { getPublicConnection } from "@/lib/google/auth-client";
import { isGoogleCalendarConfigured } from "@/lib/google/config";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Connection status for Settings / widgets.
 *
 * Intentionally does NOT trigger backfill — polling this endpoint must not
 * create Google Calendar events. Backfill runs from OAuth callback only
 * (and explicit Sync flows that call it deliberately).
 */
export async function GET() {
  try {
    const session = await requireApiSession();
    const connection = await getPublicConnection(
      session.user.id,
      session.membership.companyId
    );

    return NextResponse.json({
      ...connection,
      configured: isGoogleCalendarConfigured(),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      {
        connected: false,
        status: "NOT_CONNECTED",
        email: null,
        configured: isGoogleCalendarConfigured(),
        tasksScopeGranted: false,
        hasRefreshToken: false,
      },
      { status: 200 }
    );
  }
}
