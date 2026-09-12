import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import {
  getConversationMessages,
  getOrCreateProjectConversation,
  sendWhatsAppMessage,
} from "@/lib/whatsapp/service";
import { toSafeErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * Fetch messages for a conversation or project.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const accessibleProjectIds = await getAccessibleProjectIds(session);
    const { searchParams } = new URL(request.url);

    let conversationId = searchParams.get("conversationId");
    const projectId = searchParams.get("projectId");

    if (!conversationId && projectId) {
      conversationId = await getOrCreateProjectConversation(
        projectId,
        accessibleProjectIds
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId or projectId is required" },
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
      { error: toSafeErrorMessage(error), messages: [] },
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
