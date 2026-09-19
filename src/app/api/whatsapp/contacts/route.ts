import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { sessionHasClientCommunication } from "@/lib/authorization";
import { getWhatsAppContacts } from "@/lib/whatsapp-contacts";
import { getWhatsAppInboxStatus } from "@/lib/messaging/provider-select";
import { toSafeErrorMessage } from "@/lib/errors";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Lazy WhatsApp contact list — avoids loading on every RoleShell render. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession();
    if (
      session.membership.role === Role.CLIENT ||
      session.membership.role === Role.SUBCONTRACTOR ||
      !sessionHasClientCommunication(session)
    ) {
      return NextResponse.json({ error: "Access denied", contacts: [] }, { status: 403 });
    }
    assertRateLimit(
      clientKeyFromHeaders(request.headers, `whatsapp-contacts:${session.user.id}`),
      ACTION_RATE.limit,
      ACTION_RATE.windowMs
    );
    const projectIds = await getAccessibleProjectIds(session);
    const contacts = await getWhatsAppContacts({
      companyId: session.membership.companyId,
      userId: session.user.id,
      accessibleProjectIds: projectIds,
    });
    return NextResponse.json(
      { contacts, ...getWhatsAppInboxStatus() },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: toSafeErrorMessage(error), contacts: [] },
      { status: 401 }
    );
  }
}
