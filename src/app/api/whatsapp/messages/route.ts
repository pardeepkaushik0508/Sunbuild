import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { sessionHasClientCommunication } from "@/lib/authorization";
import {
  getConversationMessages,
  getOrCreateProjectConversation,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/service";
import { getWhatsAppInboxStatus } from "@/lib/messaging/provider-select";
import { toSafeErrorMessage } from "@/lib/errors";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WA_SEND_LIMIT = 20;

function canUseWhatsApp(session: Awaited<ReturnType<typeof requireApiSession>>) {
  if (
    session.membership.role === Role.CLIENT ||
    session.membership.role === Role.SUBCONTRACTOR
  ) {
    return false;
  }
  return sessionHasClientCommunication(session);
}

/**
 * Fetch messages for a conversation or project.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession();
    if (!canUseWhatsApp(session)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const accessibleProjectIds = await getAccessibleProjectIds(session);
    const { searchParams } = new URL(request.url);

    let conversationId = searchParams.get("conversationId");
    const projectId = searchParams.get("projectId");
    const phone = searchParams.get("phone");

    if (!conversationId && projectId) {
      conversationId = await getOrCreateProjectConversation(
        projectId,
        accessibleProjectIds,
        phone
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        {
          error: "conversationId or projectId is required",
          ...getWhatsAppInboxStatus(),
        },
        { status: 400 }
      );
    }

    const data = await getConversationMessages(
      conversationId,
      accessibleProjectIds
    );

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: toSafeErrorMessage(error),
        messages: [],
        ...getWhatsAppInboxStatus(),
      },
      { status: 400 }
    );
  }
}

/**
 * Send an outbound WhatsApp message to a client on an assigned project.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    if (!canUseWhatsApp(session)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    assertRateLimit(
      clientKeyFromHeaders(request.headers, `whatsapp-send:${session.user.id}`),
      WA_SEND_LIMIT,
      ACTION_RATE.windowMs
    );
    const accessibleProjectIds = await getAccessibleProjectIds(session);

    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
      toPhone?: string;
      body?: string;
    } | null;

    if (!body?.projectId || !body?.toPhone || !body?.body) {
      return NextResponse.json(
        { error: "projectId, toPhone, and body are required" },
        { status: 400 }
      );
    }

    if (!accessibleProjectIds.includes(body.projectId)) {
      return NextResponse.json(
        { error: "Access denied to this project" },
        { status: 403 }
      );
    }

    const message = await sendWhatsAppMessage({
      projectId: body.projectId,
      toPhone: body.toPhone,
      body: body.body,
      senderUserId: session.user.id,
      senderName: session.user.name,
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    return NextResponse.json(
      { error: toSafeErrorMessage(error) },
      { status: 400 }
    );
  }
}
