import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireApiSession } from "@/lib/session";
import { completeMicrosoftTodoTask } from "@/lib/microsoft/todo";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

const bodySchema = z.object({
  microsoftTaskId: z.string().min(1),
  microsoftListId: z.string().min(1),
});

/** Mark a Microsoft To Do task completed via Graph (server-side tokens only). */
export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await completeMicrosoftTodoTask({
      userId: session.user.id,
      companyId: session.membership.companyId,
      microsoftTaskId: parsed.data.microsoftTaskId,
      microsoftListId: parsed.data.microsoftListId,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          reconnectRequired: result.reconnectRequired ?? false,
        },
        { status: result.reconnectRequired ? 401 : 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Unable to update Microsoft To Do task." },
      { status: 500 }
    );
  }
}
