import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * Lightweight heartbeat so idle timeout tracks real use even when the user
 * stays on one page (client activity alone does not update DB session.updatedAt).
 */
export async function POST() {
  try {
    await requireApiSession();
    const session = await auth.api.getSession({
      headers: await headers(),
      query: { disableCookieCache: true },
    });
    if (!session?.session?.token) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    await prisma.session.updateMany({
      where: { token: session.session.token },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
