import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { listGoogleEventsInRange } from "@/lib/google/calendar";
import { collectSyncedGoogleEventIds } from "@/lib/google/sync";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

/**
 * Pull Google Calendar events for the visible month (± pad for grid edges).
 * Cached ~45s server-side. Parallelizes Google + local dedupe lookups.
 */
export async function GET(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    const url = new URL(request.url);
    const aroundRaw = url.searchParams.get("around");
    const around = aroundRaw ? new Date(aroundRaw) : new Date();
    if (Number.isNaN(around.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Visible month only + 7-day pad (not ±1–2 months)
    const timeMin = new Date(startOfMonth(around));
    timeMin.setDate(timeMin.getDate() - 7);
    const timeMax = new Date(endOfMonth(around));
    timeMax.setDate(timeMax.getDate() + 7);

    const [listed, projectIds] = await Promise.all([
      listGoogleEventsInRange(
        session.user.id,
        session.membership.companyId,
        timeMin,
        timeMax
      ),
      getAccessibleProjectIds(session),
    ]);

    if (listed.reconnectRequired) {
      return NextResponse.json({
        events: [] as CalendarEvent[],
        reconnectRequired: true,
        error: listed.error,
      });
    }

    const syncedIds = listed.events.length
      ? await collectSyncedGoogleEventIds(
          session.membership.companyId,
          projectIds
        )
      : new Set<string>();

    const events: CalendarEvent[] = [];
    for (const g of listed.events) {
      if (syncedIds.has(g.googleEventId)) continue;
      events.push({
        id: `google-${g.googleEventId}`,
        date: g.start.toISOString(),
        title: g.title,
        type: "google",
        meta: g.meetUrl ? "Google Meet" : "Google Calendar",
        source: "google",
        googleEventId: g.googleEventId,
      });
    }

    return NextResponse.json({
      events,
      reconnectRequired: false,
      error: listed.error,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({
      events: [] as CalendarEvent[],
      reconnectRequired: false,
      error: true,
    });
  }
}
