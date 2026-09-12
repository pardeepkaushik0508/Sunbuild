import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import {
  removeMicrosoftTaskProjectLink,
  upsertMicrosoftTaskProjectLink,
} from "@/lib/microsoft/todo";
import { prisma } from "@/lib/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.PROJECT_MANAGER,
];

const bodySchema = z.object({
  microsoftTaskId: z.string().min(1),
  microsoftListId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
});

/** Link / unlink a Microsoft To Do task to a SUNBUILD project. */
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

    const { microsoftTaskId, microsoftListId, projectId } = parsed.data;

    if (!projectId) {
      await removeMicrosoftTaskProjectLink({
        userId: session.user.id,
        companyId: session.membership.companyId,
        microsoftTaskId,
      });
      return NextResponse.json({ ok: true });
    }

    const accessible = await getAccessibleProjectIds(session);
    if (!accessible.includes(projectId)) {
      throw new ForbiddenError();
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        companyId: session.membership.companyId,
      },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await upsertMicrosoftTaskProjectLink({
      userId: session.user.id,
      companyId: session.membership.companyId,
      microsoftTaskId,
      microsoftListId,
      projectId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Could not update project link" },
      { status: 500 }
    );
  }
}
