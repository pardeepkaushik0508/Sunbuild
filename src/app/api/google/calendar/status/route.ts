import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { getPublicConnection } from "@/lib/google/calendar";
import { isGoogleCalendarConfigured } from "@/lib/google/config";
import { UnauthorizedError } from "@/lib/errors";

export async function GET() {
  try {
    const session = await requireApiSession();
    const connection = await getPublicConnection(
      session.user.id,
      session.membership.companyId
    );

    // When already connected, quietly push any pending local calendar items
    // (e.g. tasks created before Google was linked, or schedule without checkbox).
    if (connection.connected) {
      void import("@/lib/google/sync")
        .then(({ backfillGoogleCalendarForUser }) =>
          backfillGoogleCalendarForUser({
            userId: session.user.id,
            companyId: session.membership.companyId,
          })
        )
        .catch((err) => {
          console.error("[google-sync] status backfill failed:", {
            message: err instanceof Error ? err.message : "unknown",
          });
        });
    }

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
      },
      { status: 200 }
    );
  }
}
