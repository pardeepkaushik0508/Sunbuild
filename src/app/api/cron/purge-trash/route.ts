import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/lib/trash/service";

/**
 * Cron endpoint: permanently delete Trash items older than 30 days.
 * Secure with CRON_SECRET header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredTrash();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/purge-trash]", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
