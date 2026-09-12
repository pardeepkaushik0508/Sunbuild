import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { buildGoogleAuthUrl } from "@/lib/google/calendar";
import { createOAuthState, safeReturnPath } from "@/lib/google/oauth-state";
import { isGoogleCalendarConfigured } from "@/lib/google/config";
import { UnauthorizedError, ForbiddenError, AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

export async function GET(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }
    if (!isGoogleCalendarConfigured()) {
      throw new AppError(
        "Google Calendar is not configured on this server.",
        503,
        "GOOGLE_CONFIG"
      );
    }

    const url = new URL(request.url);
    const returnTo = safeReturnPath(
      url.searchParams.get("returnTo") || undefined,
      roleHome(session.membership.role)
    );

    const state = createOAuthState({
      userId: session.user.id,
      companyId: session.membership.companyId,
      returnTo,
    });

    const authUrl = buildGoogleAuthUrl(state);

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "GOOGLE_CALENDAR_CONNECT_START",
      entityType: "GoogleCalendarConnection",
      entityId: session.user.id,
    });

    return NextResponse.redirect(authUrl);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const message =
      err instanceof AppError
        ? err.message
        : "Could not start Google Calendar connection";
    const returnTo = new URL("/owner/settings", request.url);
    returnTo.searchParams.set("google", "error");
    returnTo.searchParams.set("message", message);
    return NextResponse.redirect(returnTo);
  }
}

function roleHome(role: Role): string {
  switch (role) {
    case Role.OWNER:
      return "/owner/settings";
    case Role.CEO:
      return "/settings";
    case Role.SALES_MANAGER:
      return "/settings";
    case Role.PROJECT_MANAGER:
      return "/settings";
    case Role.OPERATIONS_ADMIN:
      return "/settings";
    case Role.BOOKKEEPER:
      return "/settings";
    default:
      return "/settings";
  }
}
