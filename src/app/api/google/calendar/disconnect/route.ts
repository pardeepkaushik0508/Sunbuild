import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { disconnectGoogleCalendar } from "@/lib/google/calendar";
import { ForbiddenError, UnauthorizedError, AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    await disconnectGoogleCalendar(
      session.user.id,
      session.membership.companyId
    );

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "GOOGLE_CALENDAR_DISCONNECTED",
      entityType: "GoogleCalendarConnection",
      entityId: session.user.id,
    });

    revalidatePath("/owner/settings");
    revalidatePath("/settings");
    revalidatePath("/owner");
    revalidatePath("/pm");
    revalidatePath("/sales");
    revalidatePath("/ceo");

    const url = new URL(request.url);
    const returnTo = url.searchParams.get("returnTo") || "/settings";
    const safeReturn =
      returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/settings";

    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      return NextResponse.redirect(
        new URL(`${safeReturn}?google=disconnected`, request.url)
      );
    }
    return NextResponse.json({ ok: true, status: "NOT_CONNECTED" });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message =
      err instanceof AppError ? err.message : "Could not disconnect";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  // Allow simple link-based disconnect with confirmation page flow via POST preferred.
  return POST(request);
}
