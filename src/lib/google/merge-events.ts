import "server-only";

import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { AppSession } from "@/lib/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

const STAFF_GOOGLE_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

/**
 * Fast path for dashboard SSR: do NOT call Google here (was ~15–28s).
 * CalendarWidget fetches Google events client-side with caching.
 * Only returns local events + reconnect flag from DB.
 */
export async function mergeExternalGoogleEvents(input: {
  session: AppSession;
  localEvents: CalendarEvent[];
  /** Unused — kept for call-site compatibility. */
  around?: Date;
}): Promise<{
  events: CalendarEvent[];
  googleReconnectRequired: boolean;
  googleFetchError: boolean;
}> {
  const { session, localEvents } = input;
  if (!STAFF_GOOGLE_ROLES.includes(session.membership.role)) {
    return {
      events: localEvents,
      googleReconnectRequired: false,
      googleFetchError: false,
    };
  }

  try {
    const row = await prisma.googleCalendarConnection.findUnique({
      where: {
        userId_companyId: {
          userId: session.user.id,
          companyId: session.membership.companyId,
        },
      },
      select: { status: true },
    });
    return {
      events: localEvents,
      googleReconnectRequired: row?.status === "RECONNECT_REQUIRED",
      googleFetchError: false,
    };
  } catch {
    return {
      events: localEvents,
      googleReconnectRequired: false,
      googleFetchError: false,
    };
  }
}
