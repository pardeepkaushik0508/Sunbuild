import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { sessionHasClientCommunication } from "@/lib/authorization";
import { getWhatsAppInboxStatus } from "@/lib/messaging/provider-select";
import { toSafeErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * Twilio/Meta inbox readiness for the CRM WhatsApp sidebar.
 * Never returns secrets.
 */
export async function GET() {
  try {
    const session = await requireApiSession();
    if (
      session.membership.role === Role.CLIENT ||
      session.membership.role === Role.SUBCONTRACTOR ||
      !sessionHasClientCommunication(session)
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(getWhatsAppInboxStatus(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: toSafeErrorMessage(error) },
      { status: 401 }
    );
  }
}
