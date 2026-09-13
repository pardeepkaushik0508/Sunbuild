import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { getNotificationFeed } from "@/lib/notifications-feed";

export async function GET() {
  try {
    const session = await requireApiSession();
    const { items, unreadCount } = await getNotificationFeed(session, {
      limit: 15,
    });
    return NextResponse.json({ items, unreadCount });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
