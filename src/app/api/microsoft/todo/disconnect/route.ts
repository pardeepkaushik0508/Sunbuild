import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { disconnectMicrosoftTodo } from "@/lib/microsoft/todo";
import { safeReturnPath } from "@/lib/google/oauth-state";
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

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    await disconnectMicrosoftTodo(
      session.user.id,
      session.membership.companyId
    );

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "MICROSOFT_TODO_DISCONNECTED",
      entityType: "MicrosoftTodoConnection",
      entityId: session.user.id,
    });

    const url = new URL(request.url);
    const accept = request.headers.get("accept") || "";
    if (accept.includes("application/json")) {
      return NextResponse.json({ ok: true });
    }

    const returnTo = safeReturnPath(
      url.searchParams.get("returnTo") || undefined,
      session.membership.role === Role.OWNER ? "/owner/settings" : "/settings"
    );
    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("microsoft", "disconnected");
    return NextResponse.redirect(dest);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message =
      err instanceof AppError
        ? err.message
        : "Could not disconnect Microsoft To Do";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
