import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  getPublicConnection,
  getAuthedGoogleClient,
} from "@/lib/google/auth-client";
import {
  hasGoogleCalendarEventsScope,
  hasGoogleTasksScope,
  isGoogleCalendarConfigured,
} from "@/lib/google/config";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

const ALLOWED: Role[] = [Role.OWNER, Role.CEO, Role.OPERATIONS_ADMIN];

/**
 * Owner/admin Google integration diagnostics.
 * Never returns tokens, secrets, or encrypted values.
 */
export async function GET() {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    const companyId = session.membership.companyId;
    const userId = session.user.id;
    const connection = await getPublicConnection(userId, companyId);

    const row = await prisma.googleCalendarConnection.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: {
        status: true,
        googleAccountEmail: true,
        scope: true,
        tokenExpiry: true,
        refreshTokenEncrypted: true,
        connectedAt: true,
        googleCalendarId: true,
      },
    });

    const [pendingSync, synced, failed] = await Promise.all([
      prisma.task.count({
        where: {
          project: { companyId },
          dueDate: { not: null },
          googleEventId: null,
          googleSyncStatus: {
            in: ["LOCAL_ONLY", "SYNC_ERROR", "RECONNECT_REQUIRED"],
          },
          OR: [{ assigneeId: userId }, { createdById: userId }],
        },
      }),
      prisma.task.count({
        where: {
          project: { companyId },
          googleSyncStatus: "SYNCED",
          googleEventId: { not: null },
          OR: [{ assigneeId: userId }, { createdById: userId }],
        },
      }),
      prisma.task.count({
        where: {
          project: { companyId },
          googleSyncStatus: "SYNC_ERROR",
          OR: [{ assigneeId: userId }, { createdById: userId }],
        },
      }),
    ]);

    let calendarApiHealth: "ok" | "error" | "skipped" = "skipped";
    let tasksApiHealth: "ok" | "error" | "skipped" = "skipped";
    let calendarApiStatus: number | null = null;
    let tasksApiStatus: number | null = null;
    let tasksApiReason: string | null = null;

    if (connection.connected) {
      const authed = await getAuthedGoogleClient(userId, companyId);
      if (!authed) {
        calendarApiHealth = "error";
        tasksApiHealth = "error";
      } else {
        try {
          const { calendar } = await import("@googleapis/calendar");
          const cal = calendar({ version: "v3", auth: authed.auth });
          await cal.calendarList.list({ maxResults: 1 });
          calendarApiHealth = "ok";
          calendarApiStatus = 200;
        } catch (err) {
          calendarApiHealth = "error";
          calendarApiStatus = (err as { code?: number })?.code ?? null;
        }
        try {
          const { tasks } = await import("@googleapis/tasks");
          const tasksApi = tasks({ version: "v1", auth: authed.auth });
          await tasksApi.tasklists.list({ maxResults: 1 });
          tasksApiHealth = "ok";
          tasksApiStatus = 200;
        } catch (err) {
          tasksApiHealth = "error";
          tasksApiStatus = (err as { code?: number })?.code ?? null;
          const { classifyGoogleError } = await import("@/lib/google/errors");
          tasksApiReason = classifyGoogleError(err, "tasks").code;
        }
      }
    }

    console.info("[google-oauth] diagnostics", {
      userId,
      companyId,
      status: connection.status,
      calendarApiHealth,
      tasksApiHealth,
      tasksApiReason,
    });

    return NextResponse.json({
      googleConfigured: isGoogleCalendarConfigured(),
      connectionStatus: connection.status,
      connected: connection.connected,
      googleEmail: row?.googleAccountEmail ?? null,
      calendarScopeGranted: hasGoogleCalendarEventsScope(row?.scope),
      tasksScopeGranted: hasGoogleTasksScope(row?.scope),
      hasRefreshToken: Boolean(row?.refreshTokenEncrypted),
      tokenExpiry: row?.tokenExpiry?.toISOString() ?? null,
      googleCalendarId: row?.googleCalendarId ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      scopeNames: row?.scope?.split(/\s+/).filter(Boolean) ?? [],
      calendarApiHealth,
      calendarApiStatus,
      tasksApiHealth,
      tasksApiStatus,
      tasksApiReason,
      pendingLocalSyncCount: pendingSync,
      syncedTaskCount: synced,
      failedTaskCount: failed,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[google-oauth] diagnostics failed:", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Diagnostics failed" }, { status: 500 });
  }
}
