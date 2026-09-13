import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { listGoogleEventsInRange } from "@/lib/google/calendar";
import { listGoogleTasksInRange } from "@/lib/google/tasks";
import { collectSyncedGoogleEventIds } from "@/lib/google/sync";
import { mapGoogleEventToCalendarEvent } from "@/lib/google/event-display";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
  Role.SUBCONTRACTOR,
  Role.CLIENT,
];

/**
 * Pull Google Calendar events + Google Tasks for the visible month (± pad).
 * Tasks require a separate API/scope from normal calendar events.
 * Pass ?force=1 to bypass the short-lived server cache (Sync button).
 */
export async function GET(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    const url = new URL(request.url);
    const aroundRaw = url.searchParams.get("around");
    const force =
      url.searchParams.get("force") === "1" ||
      url.searchParams.get("force") === "true";
    const around = aroundRaw ? new Date(aroundRaw) : new Date();
    if (Number.isNaN(around.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const timeMin = new Date(startOfMonth(around));
    timeMin.setDate(timeMin.getDate() - 7);
    const timeMax = new Date(endOfMonth(around));
    timeMax.setDate(timeMax.getDate() + 7);

    const [listed, taskListed, projectIds] = await Promise.all([
      listGoogleEventsInRange(
        session.user.id,
        session.membership.companyId,
        timeMin,
        timeMax,
        { force }
      ),
      listGoogleTasksInRange(
        session.user.id,
        session.membership.companyId,
        timeMin,
        timeMax,
        { force }
      ),
      getAccessibleProjectIds(session),
    ]);

    if (listed.reconnectRequired) {
      return NextResponse.json({
        events: [] as CalendarEvent[],
        reconnectRequired: true,
        tasksScopeMissing: false,
        error: listed.error,
        count: 0,
      });
    }

    const syncedIds =
      listed.events.length > 0
        ? await collectSyncedGoogleEventIds(
            session.membership.companyId,
            projectIds
          )
        : new Set<string>();

    const events: CalendarEvent[] = [];
    for (const g of listed.events) {
      if (syncedIds.has(g.googleEventId)) continue;
      events.push(mapGoogleEventToCalendarEvent(g));
    }
    for (const t of taskListed.tasks) {
      events.push(
        mapGoogleEventToCalendarEvent({
          ...t,
          kind: "task",
          calendarName: t.calendarName || "Tasks",
        })
      );
    }

    return NextResponse.json({
      events,
      reconnectRequired: false,
      tasksScopeMissing: taskListed.tasksScopeMissing,
      error: listed.error || taskListed.error,
      count: events.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[google-calendar] events route failed:", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({
      events: [] as CalendarEvent[],
      reconnectRequired: false,
      tasksScopeMissing: false,
      error: true,
      count: 0,
    });
  }
}
