import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { getPublicMicrosoftConnection } from "@/lib/microsoft/todo";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

/** Public connection status only — never returns tokens or secrets. */
export async function GET() {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    const connection = await getPublicMicrosoftConnection(
      session.user.id,
      session.membership.companyId
    );

    return NextResponse.json({
      connected: Boolean(connection.connected),
      status: connection.status,
      email: connection.email ?? null,
      configured: Boolean(connection.configured),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Could not load Microsoft To Do status" },
      { status: 500 }
    );
  }
}
