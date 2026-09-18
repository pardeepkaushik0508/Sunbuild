import { NextRequest, NextResponse } from "next/server";
import { dispatchDueNotifications } from "@/lib/notifications/due-dispatcher";

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
    const result = await dispatchDueNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/due-notifications]", err);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
