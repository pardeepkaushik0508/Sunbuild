import { NextResponse } from "next/server";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { getWhatsAppContacts } from "@/lib/whatsapp-contacts";
import { toSafeErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Lazy WhatsApp contact list — avoids loading on every RoleShell render. */
export async function GET() {
  try {
    const session = await requireApiSession();
    const projectIds = await getAccessibleProjectIds(session);
    const contacts = await getWhatsAppContacts({
      companyId: session.membership.companyId,
      userId: session.user.id,
      accessibleProjectIds: projectIds,
    });
    return NextResponse.json(
      { contacts },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: toSafeErrorMessage(error), contacts: [] },
      { status: 401 }
    );
  }
}
