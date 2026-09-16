import "server-only";

import { tasks as googleTasks } from "@googleapis/tasks";
import { prisma } from "@/lib/db";
import { getAuthedGoogleClient } from "@/lib/google/auth-client";
import type { ListedGoogleEvent } from "@/lib/google/listed-event";
import { hasGoogleTasksScope } from "@/lib/google/config";
import {
  classifyGoogleError,
  googleErrorLogFields,
  type GoogleErrorCode,
} from "@/lib/google/errors";
import {
  getGoogleCache,
  getGoogleErrorCacheTtlMs,
  googleTasksCacheKey,
  invalidateGoogleCacheForUser,
  setGoogleCache,
} from "@/lib/google/cache";

export type ListGoogleTasksResult = {
  tasks: ListedGoogleEvent[];
  reconnectRequired: boolean;
  tasksScopeMissing: boolean;
  tasksApiDisabled: boolean;
  tasksErrorCode: GoogleErrorCode | null;
  error: boolean;
  errorMessage: string | null;
};

/**
 * Fetch Google Tasks with due dates in range.
 * These appear under the "Tasks" calendar in Google Calendar UI but are NOT
 * returned by Calendar events.list — they require the Tasks API + tasks scope.
 *
 * Tasks failures never mark the Calendar connection RECONNECT_REQUIRED unless
 * the OAuth grant itself is revoked/expired (invalid_grant / 401 auth).
 */
export async function listGoogleTasksInRange(
  userId: string,
  companyId: string,
  timeMin: Date,
  timeMax: Date,
  opts?: { force?: boolean }
): Promise<ListGoogleTasksResult> {
  const cacheKey = googleTasksCacheKey(
    userId,
    companyId,
    timeMin.toISOString(),
    timeMax.toISOString()
  );
  if (!opts?.force) {
    const cached = getGoogleCache<ListGoogleTasksResult>(cacheKey);
    if (cached) return cached;
  } else {
    invalidateGoogleCacheForUser(userId);
  }

  const authed = await getAuthedGoogleClient(userId, companyId);
  if (!authed) {
    return {
      tasks: [],
      reconnectRequired: true,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      tasksErrorCode: "GOOGLE_AUTH_EXPIRED",
      error: true,
      errorMessage: "Reconnect Google Calendar — sign-in expired.",
    };
  }

  // Prefer live API when stored scope is null/empty (legacy rows). When scope
  // is present and clearly lacks Tasks, skip the API call.
  const scopeKnown = Boolean(authed.scope?.trim());
  if (scopeKnown && !hasGoogleTasksScope(authed.scope)) {
    const result: ListGoogleTasksResult = {
      tasks: [],
      reconnectRequired: false,
      tasksScopeMissing: true,
      tasksApiDisabled: false,
      tasksErrorCode: "GOOGLE_TASKS_SCOPE_MISSING",
      error: false,
      errorMessage:
        "Reconnect Google to grant Google Tasks access (tasks.readonly).",
    };
    setGoogleCache(cacheKey, result, getGoogleErrorCacheTtlMs());
    return result;
  }

  try {
    const tasksApi = googleTasks({ version: "v1", auth: authed.auth });
    const listsRes = await tasksApi.tasklists.list({ maxResults: 100 });
    const lists = listsRes.data.items ?? [];
    const tasks: ListedGoogleEvent[] = [];
    const seen = new Set<string>();

    console.info("[google-tasks] tasklists.list ok", {
      userId,
      companyId,
      listCount: lists.length,
    });

    await Promise.all(
      lists.map(async (list) => {
        if (!list.id) return;
        try {
          const res = await tasksApi.tasks.list({
            tasklist: list.id,
            showCompleted: true,
            showHidden: false,
            showDeleted: false,
            maxResults: 100,
            dueMin: timeMin.toISOString(),
            dueMax: timeMax.toISOString(),
          });
          for (const item of res.data.items ?? []) {
            if (!item.id || !item.due) continue;
            if (item.status === "completed") continue;
            const due = new Date(item.due);
            if (Number.isNaN(due.getTime())) continue;
            if (due < timeMin || due > timeMax) continue;
            const key = `${list.id}:${item.id}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Google Tasks due dates are typically date-only (midnight UTC).
            const allDay =
              due.getUTCHours() === 0 &&
              due.getUTCMinutes() === 0 &&
              due.getUTCSeconds() === 0;
            const start = allDay
              ? new Date(`${due.toISOString().slice(0, 10)}T12:00:00.000Z`)
              : due;
            const end = new Date(start.getTime() + 60 * 60 * 1000);

            tasks.push({
              googleEventId: `task-${item.id}`,
              title: item.title?.trim() || "(Untitled task)",
              start,
              end,
              allDay,
              location: null,
              meetUrl: null,
              description: item.notes ?? null,
              calendarId: list.id,
              calendarName: list.title || "Tasks",
            });
          }
        } catch (listErr) {
          const classified = classifyGoogleError(listErr, "tasks");
          if (
            classified.tasksScopeMissing ||
            classified.requiresReconnect ||
            classified.tasksApiDisabled
          ) {
            throw listErr;
          }
          console.error("[google-tasks] tasklist fetch failed:", {
            listId: list.id,
            ...googleErrorLogFields(listErr, classified),
          });
        }
      })
    );

    // Live Tasks success proves tasks.readonly is granted — heal stale scope.
    if (!hasGoogleTasksScope(authed.scope)) {
      try {
        const nextScope = [
          ...(authed.scope ? authed.scope.split(/\s+/).filter(Boolean) : []),
          "https://www.googleapis.com/auth/tasks.readonly",
        ];
        await prisma.googleCalendarConnection.update({
          where: { id: authed.connectionId },
          data: { scope: [...new Set(nextScope)].join(" ") },
        });
      } catch {
        // Non-fatal — listing already succeeded.
      }
    }

    tasks.sort((a, b) => a.start.getTime() - b.start.getTime());
    console.info("[google-tasks] tasks.list ok", {
      userId,
      companyId,
      taskCount: tasks.length,
    });
    const result: ListGoogleTasksResult = {
      tasks,
      reconnectRequired: false,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      tasksErrorCode: null,
      error: false,
      errorMessage: null,
    };
    setGoogleCache(cacheKey, result, 45_000);
    return result;
  } catch (err) {
    const classified = classifyGoogleError(err, "tasks");
    console.error("[google-tasks] list failed:", {
      userId,
      companyId,
      ...googleErrorLogFields(err, classified),
    });

    // Only escalate Calendar connection when OAuth itself is dead.
    if (classified.requiresReconnect) {
      const { markGoogleReconnectRequired } = await import(
        "@/lib/google/auth-client"
      );
      await markGoogleReconnectRequired(authed.connectionId);
    }

    const result: ListGoogleTasksResult = {
      tasks: [],
      reconnectRequired: classified.requiresReconnect,
      tasksScopeMissing: classified.tasksScopeMissing,
      tasksApiDisabled: classified.tasksApiDisabled,
      tasksErrorCode: classified.code,
      error: true,
      errorMessage: classified.userMessage,
    };
    setGoogleCache(cacheKey, result, getGoogleErrorCacheTtlMs());
    return result;
  }
}
