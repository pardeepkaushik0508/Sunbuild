import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { buildMicrosoftAuthUrl } from "@/lib/microsoft/todo";
import { createOAuthState, safeReturnPath } from "@/lib/google/oauth-state";
import { isMicrosoftTodoConfigured } from "@/lib/microsoft/config";
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
    if (!isMicrosoftTodoConfigured()) {
      throw new AppError(
        "Microsoft To Do is not configured on this server.",
        503,
        "MICROSOFT_CONFIG"
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

    const authUrl = buildMicrosoftAuthUrl(state);

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "MICROSOFT_TODO_CONNECT_START",
      entityType: "MicrosoftTodoConnection",
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
        : "Could not start Microsoft To Do connection";
    const returnTo = new URL("/owner/settings", request.url);
    returnTo.searchParams.set("microsoft", "error");
    returnTo.searchParams.set("message", message);
    return NextResponse.redirect(returnTo);
  }
}

function roleHome(role: Role): string {
  switch (role) {
    case Role.OWNER:
      return "/owner/settings";
    default:
      return "/settings";
  }
}
