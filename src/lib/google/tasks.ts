import "server-only";

import { google } from "googleapis";
import {
  getAuthedCalendarClient,
  type ListedGoogleEvent,
} from "@/lib/google/calendar";
import { hasGoogleTasksScope } from "@/lib/google/config";
import {
  getGoogleCache,
  invalidateGoogleCacheForUser,
  setGoogleCache,
} from "@/lib/google/cache";

function tasksCacheKey(
  userId: string,
  companyId: string,
  timeMinIso: string,
  timeMaxIso: string
) {
  return `gcal-tasks:${userId}:${companyId}:${timeMinIso}:${timeMaxIso}`;
}

/**
 * Fetch Google Tasks with due dates in range.
 * These appear under the "Tasks" calendar in Google Calendar UI but are NOT
 * returned by Calendar events.list — they require the Tasks API + tasks scope.
 */
export async function listGoogleTasksInRange(
  userId: string,
  companyId: string,
  timeMin: Date,
  timeMax: Date,
  opts?: { force?: boolean }
): Promise<{
  tasks: ListedGoogleEvent[];
  reconnectRequired: boolean;
  tasksScopeMissing: boolean;
  error: boolean;
}> {
  const cacheKey = tasksCacheKey(
    userId,
    companyId,
    timeMin.toISOString(),
    timeMax.toISOString()
  );
  if (!opts?.force) {
    const cached = getGoogleCache<{
      tasks: ListedGoogleEvent[];
      reconnectRequired: boolean;
      tasksScopeMissing: boolean;
      error: boolean;
    }>(cacheKey);
    if (cached) return cached;
  } else {
    invalidateGoogleCacheForUser(userId);
  }

  const authed = await getAuthedCalendarClient(userId, companyId);
  if (!authed) {
    return {
      tasks: [],
      reconnectRequired: true,
      tasksScopeMissing: false,
      error: true,
    };
  }

  if (!hasGoogleTasksScope(authed.scope)) {
    const result = {
      tasks: [] as ListedGoogleEvent[],
      reconnectRequired: false,
      tasksScopeMissing: true,
      error: false,
    };
    setGoogleCache(cacheKey, result, 45_000);
    return result;
  }

  try {
    const tasksApi = google.tasks({ version: "v1", auth: authed.auth });
    const listsRes = await tasksApi.tasklists.list({ maxResults: 100 });
    const lists = listsRes.data.items ?? [];
    const tasks: ListedGoogleEvent[] = [];
    const seen = new Set<string>();

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
              ? new Date(
                  `${due.toISOString().slice(0, 10)}T12:00:00.000Z`
                )
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
          const status = (listErr as { code?: number })?.code;
          if (status === 401 || status === 403) throw listErr;
          console.error("[google-tasks] tasklist fetch failed:", {
            listId: list.id,
            message: listErr instanceof Error ? listErr.message : "unknown",
          });
        }
      })
    );

    tasks.sort((a, b) => a.start.getTime() - b.start.getTime());
    const result = {
      tasks,
      reconnectRequired: false,
      tasksScopeMissing: false,
      error: false,
    };
    setGoogleCache(cacheKey, result, 45_000);
    return result;
  } catch (err) {
    const status = (err as { code?: number })?.code;
    console.error("[google-tasks] list failed:", {
      status,
      message: err instanceof Error ? err.message : "unknown",
    });
    if (status === 401 || status === 403) {
      // Missing/expired tasks scope — ask user to reconnect without wiping calendar events.
      return {
        tasks: [],
        reconnectRequired: false,
        tasksScopeMissing: true,
        error: true,
      };
    }
    return {
      tasks: [],
      reconnectRequired: false,
      tasksScopeMissing: false,
      error: true,
    };
  }
}
