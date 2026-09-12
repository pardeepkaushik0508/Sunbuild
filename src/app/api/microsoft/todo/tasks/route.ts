import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireApiSession } from "@/lib/session";
import {
  loadHighPriorityMicrosoftTasks,
  loadMicrosoftTodoTasks,
} from "@/lib/microsoft/todo";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import type {
  NormalizedMicrosoftTodoTask,
  PublicMicrosoftTodoConnection,
} from "@/lib/microsoft/types";

const ALLOWED: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

function publicConnection(
  connection: PublicMicrosoftTodoConnection
): PublicMicrosoftTodoConnection {
  return {
    connected: Boolean(connection.connected),
    status: connection.status,
    email: connection.email ?? null,
    configured: Boolean(connection.configured),
  };
}

function publicTask(task: NormalizedMicrosoftTodoTask): NormalizedMicrosoftTodoTask {
  return {
    id: task.id,
    externalId: task.externalId,
    title: task.title,
    description: task.description,
    importance: task.importance,
    status: task.status,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    source: "MICROSOFT_TODO",
    microsoftTaskId: task.microsoftTaskId,
    microsoftListId: task.microsoftListId,
    microsoftAccountId: task.microsoftAccountId,
    linkedProjectId: task.linkedProjectId,
    linkedProjectName: task.linkedProjectName,
    webLink: task.webLink,
    isOverdue: task.isOverdue,
  };
}

/**
 * List Microsoft To Do tasks (normalized). Tokens never leave the server.
 * Query: importance=high|all, refresh=1 to bypass cache
 */
export async function GET(request: Request) {
  try {
    const session = await requireApiSession();
    if (!ALLOWED.includes(session.membership.role)) {
      throw new ForbiddenError();
    }

    const url = new URL(request.url);
    const importance =
      url.searchParams.get("importance") === "high" ? "high" : "all";
    const bypassCache = url.searchParams.get("refresh") === "1";

    const result =
      importance === "high"
        ? await loadHighPriorityMicrosoftTasks(
            session.user.id,
            session.membership.companyId,
            { bypassCache }
          )
        : await loadMicrosoftTodoTasks(
            session.user.id,
            session.membership.companyId,
            { importance: "all", bypassCache }
          );

    return NextResponse.json({
      tasks: result.tasks.map(publicTask),
      connection: publicConnection(result.connection),
      error: result.error,
      reconnectRequired: result.reconnectRequired,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      {
        tasks: [],
        error: "Unable to sync Microsoft To Do.",
        reconnectRequired: false,
      },
      { status: 200 }
    );
  }
}
