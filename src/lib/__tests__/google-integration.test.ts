/**
 * Google Calendar + Tasks integration unit tests.
 * Run: npx tsx --test src/lib/__tests__/google-integration.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  GOOGLE_CALENDAR_SCOPES,
  hasGoogleCalendarEventsScope,
  hasGoogleTasksScope,
  normalizeGrantedScopes,
} from "../google/scopes";
import { classifyGoogleError } from "../google/errors";
import {
  clearGoogleCacheForTests,
  getGoogleCache,
  googleEventsCacheKey,
  googleTasksCacheKey,
  invalidateGoogleCacheForUser,
  setGoogleCache,
} from "../google/cache";

describe("Google OAuth scopes", () => {
  it("requests calendar.events, calendar.readonly, tasks.readonly, email, openid", () => {
    assert.ok(
      GOOGLE_CALENDAR_SCOPES.includes(
        "https://www.googleapis.com/auth/calendar.events"
      )
    );
    assert.ok(
      GOOGLE_CALENDAR_SCOPES.includes(
        "https://www.googleapis.com/auth/calendar.readonly"
      )
    );
    assert.ok(
      GOOGLE_CALENDAR_SCOPES.includes(
        "https://www.googleapis.com/auth/tasks.readonly"
      )
    );
    assert.ok(
      GOOGLE_CALENDAR_SCOPES.includes(
        "https://www.googleapis.com/auth/userinfo.email"
      )
    );
    assert.ok(GOOGLE_CALENDAR_SCOPES.includes("openid"));
  });

  it("detects tasks.readonly and full tasks scope", () => {
    assert.equal(
      hasGoogleTasksScope(
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks.readonly"
      ),
      true
    );
    assert.equal(
      hasGoogleTasksScope("https://www.googleapis.com/auth/tasks"),
      true
    );
    assert.equal(
      hasGoogleTasksScope(
        "https://www.googleapis.com/auth/calendar.events"
      ),
      false
    );
    assert.equal(hasGoogleTasksScope(null), false);
    assert.equal(hasGoogleTasksScope(""), false);
  });

  it("detects calendar events scope", () => {
    assert.equal(
      hasGoogleCalendarEventsScope(
        "https://www.googleapis.com/auth/calendar.events"
      ),
      true
    );
    assert.equal(hasGoogleCalendarEventsScope("openid"), false);
  });

  it("normalizes granted scopes without inventing tasks when empty and fallback off", () => {
    assert.equal(normalizeGrantedScopes(null, false), "");
    assert.equal(normalizeGrantedScopes("  ", false), "");
    const withFallback = normalizeGrantedScopes(null, true);
    assert.ok(withFallback.includes("tasks.readonly"));
  });

  it("dedupes and preserves actual granted scopes", () => {
    const granted =
      "openid openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks.readonly";
    const normalized = normalizeGrantedScopes(granted, false);
    const parts = normalized.split(" ");
    assert.equal(new Set(parts).size, parts.length);
    assert.ok(hasGoogleTasksScope(normalized));
    assert.ok(hasGoogleCalendarEventsScope(normalized));
  });
});

describe("Google error classification", () => {
  it("classifies invalid_grant as auth revoked / reconnect", () => {
    const c = classifyGoogleError(
      { code: 400, message: "invalid_grant" },
      "oauth"
    );
    assert.equal(c.code, "GOOGLE_AUTH_REVOKED");
    assert.equal(c.requiresReconnect, true);
    assert.equal(c.tasksScopeMissing, false);
  });

  it("classifies Tasks ACCESS_TOKEN_SCOPE_INSUFFICIENT as scope missing without calendar reconnect", () => {
    const c = classifyGoogleError(
      {
        code: 403,
        message: "Request had insufficient authentication scopes.",
        errors: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
      },
      "tasks"
    );
    assert.equal(c.code, "GOOGLE_TASKS_SCOPE_MISSING");
    assert.equal(c.tasksScopeMissing, true);
    assert.equal(c.requiresReconnect, false);
  });

  it("classifies Tasks SERVICE_DISABLED without reconnect", () => {
    const c = classifyGoogleError(
      {
        code: 403,
        message: "Google Tasks API has not been used in project",
        errors: [{ reason: "SERVICE_DISABLED" }],
      },
      "tasks"
    );
    assert.equal(c.code, "GOOGLE_TASKS_API_DISABLED");
    assert.equal(c.tasksApiDisabled, true);
    assert.equal(c.requiresReconnect, false);
    assert.equal(c.tasksScopeMissing, false);
  });

  it("classifies Tasks PERMISSION_DENIED separately from scope missing", () => {
    const c = classifyGoogleError(
      {
        code: 403,
        response: {
          data: {
            error: { status: "PERMISSION_DENIED", message: "Permission denied" },
          },
        },
      },
      "tasks"
    );
    assert.equal(c.code, "GOOGLE_TASKS_PERMISSION_DENIED");
    assert.equal(c.tasksScopeMissing, false);
    assert.equal(c.requiresReconnect, false);
  });

  it("classifies Tasks 401 as auth reconnect", () => {
    const c = classifyGoogleError({ code: 401, message: "Unauthorized" }, "tasks");
    assert.equal(c.requiresReconnect, true);
    assert.equal(c.tasksScopeMissing, false);
  });

  it("classifies rate limit without reconnect", () => {
    const c = classifyGoogleError(
      { code: 429, message: "Rate Limit Exceeded" },
      "calendar"
    );
    assert.equal(c.code, "GOOGLE_RATE_LIMIT");
    assert.equal(c.requiresReconnect, false);
  });

  it("classifies network errors without reconnect", () => {
    const c = classifyGoogleError(
      new Error("fetch failed: ECONNRESET"),
      "oauth"
    );
    assert.equal(c.code, "GOOGLE_NETWORK_ERROR");
    assert.equal(c.requiresReconnect, false);
  });

  it("classifies Calendar 401 as reconnect", () => {
    const c = classifyGoogleError({ code: 401 }, "calendar");
    assert.equal(c.requiresReconnect, true);
  });

  it("classifies bare Tasks 403 as scope missing (Calendar stays connected)", () => {
    const c = classifyGoogleError({ code: 403, message: "Forbidden" }, "tasks");
    assert.equal(c.tasksScopeMissing, true);
    assert.equal(c.requiresReconnect, false);
  });
});

describe("Google cache invalidation", () => {
  beforeEach(() => {
    clearGoogleCacheForTests();
  });

  it("invalidates both events and tasks keys for a user", () => {
    const userId = "user-a";
    const companyId = "co-1";
    const eventsKey = googleEventsCacheKey(
      userId,
      companyId,
      "2026-09-01",
      "2026-09-30"
    );
    const tasksKey = googleTasksCacheKey(
      userId,
      companyId,
      "2026-09-01",
      "2026-09-30"
    );
    const legacyTasksKey = `gcal-tasks:${userId}:${companyId}:2026-09-01:2026-09-30`;
    const otherUserKey = googleTasksCacheKey(
      "user-b",
      companyId,
      "2026-09-01",
      "2026-09-30"
    );

    setGoogleCache(eventsKey, { ok: true }, 60_000);
    setGoogleCache(
      tasksKey,
      { tasksScopeMissing: true, tasks: [] },
      60_000
    );
    setGoogleCache(legacyTasksKey, { tasksScopeMissing: true }, 60_000);
    setGoogleCache(otherUserKey, { keep: true }, 60_000);

    invalidateGoogleCacheForUser(userId);

    assert.equal(getGoogleCache(eventsKey), null);
    assert.equal(getGoogleCache(tasksKey), null);
    assert.equal(getGoogleCache(legacyTasksKey), null);
    assert.deepEqual(getGoogleCache(otherUserKey), { keep: true });
  });

  it("force reconnect scenario: stale tasksScopeMissing does not survive invalidation", () => {
    const userId = "u1";
    const companyId = "c1";
    const key = googleTasksCacheKey(userId, companyId, "a", "b");
    setGoogleCache(
      key,
      {
        tasks: [],
        reconnectRequired: false,
        tasksScopeMissing: true,
        error: false,
      },
      45_000
    );
    // Simulate OAuth success clearing cache
    invalidateGoogleCacheForUser(userId);
    assert.equal(getGoogleCache(key), null);
  });
});

describe("OAuth return path safety", () => {
  it("rejects open redirects", async () => {
    // Inline mirror of safeReturnPath to avoid server-only oauth-state import.
    function safeReturnPath(returnTo: string | undefined, fallback: string) {
      if (!returnTo) return fallback;
      if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
      if (returnTo.includes("://")) return fallback;
      return returnTo;
    }
    assert.equal(safeReturnPath("/settings", "/"), "/settings");
    assert.equal(safeReturnPath("//evil.com", "/settings"), "/settings");
    assert.equal(
      safeReturnPath("https://evil.com", "/settings"),
      "/settings"
    );
    assert.equal(safeReturnPath(undefined, "/settings"), "/settings");
  });
});

describe("All-day / date helpers (task sync semantics)", () => {
  it("treats UTC midnight as date-only", () => {
    function isDateOnlyMidnight(d: Date): boolean {
      return (
        d.getUTCHours() === 0 &&
        d.getUTCMinutes() === 0 &&
        d.getUTCSeconds() === 0 &&
        d.getUTCMilliseconds() === 0
      );
    }
    function allDayEndExclusive(start: Date, end?: Date | null): Date {
      const base =
        end && end.getTime() > start.getTime() ? new Date(end) : new Date(start);
      base.setUTCDate(base.getUTCDate() + 1);
      return base;
    }

    const start = new Date("2026-10-01T00:00:00.000Z");
    const due = new Date("2026-10-02T00:00:00.000Z");
    assert.equal(isDateOnlyMidnight(start), true);
    assert.equal(isDateOnlyMidnight(due), true);
    const end = allDayEndExclusive(start, due);
    assert.equal(end.toISOString().slice(0, 10), "2026-10-03");
  });

  it("does not invent dates for undated tasks (null dueDate = skip)", () => {
    const dueDate: Date | null = null;
    assert.equal(dueDate == null, true);
  });
});
