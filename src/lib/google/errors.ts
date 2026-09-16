/**
 * Safe Google API error classification (no tokens/secrets in results).
 */

export type GoogleErrorCode =
  | "GOOGLE_TASKS_SCOPE_MISSING"
  | "GOOGLE_TASKS_PERMISSION_DENIED"
  | "GOOGLE_TASKS_API_DISABLED"
  | "GOOGLE_AUTH_EXPIRED"
  | "GOOGLE_AUTH_REVOKED"
  | "GOOGLE_TOKEN_REFRESH_FAILED"
  | "GOOGLE_CALENDAR_API_ERROR"
  | "GOOGLE_TASKS_API_ERROR"
  | "GOOGLE_RATE_LIMIT"
  | "GOOGLE_NETWORK_ERROR"
  | "GOOGLE_UNKNOWN_ERROR";

export type ClassifiedGoogleError = {
  code: GoogleErrorCode;
  httpStatus: number | null;
  reason: string | null;
  /** True when the OAuth grant itself is unusable — connection should reconnect. */
  requiresReconnect: boolean;
  /** True when Tasks read scope appears missing/insufficient. */
  tasksScopeMissing: boolean;
  /** True when Tasks API is disabled / not configured on the GCP project. */
  tasksApiDisabled: boolean;
  /** Safe user-facing message (no secrets). */
  userMessage: string;
};

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  if (typeof e.code === "number") return e.code;
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  if (typeof e.code === "string" && /^\d+$/.test(e.code)) return Number(e.code);
  return null;
}

function extractReason(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    errors?: Array<{ reason?: string; message?: string }>;
    response?: {
      data?: {
        error?:
          | string
          | {
              status?: string;
              message?: string;
              errors?: Array<{ reason?: string }>;
            };
      };
    };
    message?: string;
  };

  const nested = e.response?.data?.error;
  if (typeof nested === "object" && nested) {
    const fromErrors = nested.errors?.[0]?.reason;
    if (fromErrors) return fromErrors;
    if (nested.status) return nested.status;
  }

  if (e.errors?.[0]?.reason) return e.errors[0].reason;

  const msg = typeof e.message === "string" ? e.message : "";
  const lower = msg.toLowerCase();
  if (lower.includes("access_token_scope_insufficient")) {
    return "ACCESS_TOKEN_SCOPE_INSUFFICIENT";
  }
  if (lower.includes("insufficientpermissions") || lower.includes("insufficient permissions")) {
    return "insufficientPermissions";
  }
  if (lower.includes("accessnotconfigured") || lower.includes("access not configured")) {
    return "accessNotConfigured";
  }
  if (lower.includes("service_disabled") || lower.includes("has not been used")) {
    return "SERVICE_DISABLED";
  }
  if (lower.includes("invalid_grant")) return "invalid_grant";
  if (lower.includes("invalid_client")) return "invalid_client";

  return null;
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}

/**
 * Classify a Google API / OAuth error for Calendar or Tasks callers.
 * Never includes tokens or secrets.
 */
export function classifyGoogleError(
  err: unknown,
  surface: "calendar" | "tasks" | "oauth" = "calendar"
): ClassifiedGoogleError {
  const httpStatus = extractStatus(err);
  const reason = extractReason(err);
  const message = extractMessage(err);
  const reasonUpper = (reason ?? "").toUpperCase();
  const msgLower = message.toLowerCase();

  const isScopeInsufficient =
    reasonUpper === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    reasonUpper === "INSUFFICIENTPERMISSIONS" ||
    reason === "insufficientPermissions" ||
    msgLower.includes("insufficient authentication scopes") ||
    msgLower.includes("access_token_scope_insufficient");

  const isApiDisabled =
    reasonUpper === "SERVICE_DISABLED" ||
    reasonUpper === "ACCESSNOTCONFIGURED" ||
    reason === "accessNotConfigured" ||
    msgLower.includes("has not been used") ||
    msgLower.includes("is disabled") ||
    msgLower.includes("access not configured");

  const isInvalidGrant =
    reasonUpper === "INVALID_GRANT" ||
    msgLower.includes("invalid_grant") ||
    msgLower.includes("token has been expired or revoked");

  const isRateLimit =
    httpStatus === 429 ||
    reasonUpper === "RATELIMITEXCEEDED" ||
    reasonUpper === "USERRATELIMITEXCEEDED" ||
    msgLower.includes("rate limit");

  const isNetwork =
    msgLower.includes("econnreset") ||
    msgLower.includes("etimedout") ||
    msgLower.includes("network") ||
    msgLower.includes("fetch failed") ||
    msgLower.includes("socket hang up");

  if (isInvalidGrant || reasonUpper === "INVALID_CLIENT") {
    return {
      code: "GOOGLE_AUTH_REVOKED",
      httpStatus,
      reason,
      requiresReconnect: true,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage: "Reconnect Google Calendar — authorization was revoked or expired.",
    };
  }

  if (isRateLimit) {
    return {
      code: "GOOGLE_RATE_LIMIT",
      httpStatus,
      reason,
      requiresReconnect: false,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage: "Google is rate-limiting requests. Try Sync again shortly.",
    };
  }

  if (isNetwork) {
    return {
      code: "GOOGLE_NETWORK_ERROR",
      httpStatus,
      reason,
      requiresReconnect: false,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage: "Could not reach Google. Check your connection and try Sync.",
    };
  }

  if (surface === "tasks") {
    if (isApiDisabled) {
      return {
        code: "GOOGLE_TASKS_API_DISABLED",
        httpStatus,
        reason,
        requiresReconnect: false,
        tasksScopeMissing: false,
        tasksApiDisabled: true,
        userMessage:
          "Google Tasks API is not enabled for this Google Cloud project.",
      };
    }
    if (isScopeInsufficient) {
      return {
        code: "GOOGLE_TASKS_SCOPE_MISSING",
        httpStatus,
        reason,
        requiresReconnect: false,
        tasksScopeMissing: true,
        tasksApiDisabled: false,
        userMessage:
          "Reconnect Google to grant Google Tasks access (tasks.readonly).",
      };
    }
    if (httpStatus === 401) {
      return {
        code: "GOOGLE_AUTH_EXPIRED",
        httpStatus,
        reason,
        requiresReconnect: true,
        tasksScopeMissing: false,
        tasksApiDisabled: false,
        userMessage: "Reconnect Google Calendar — sign-in expired.",
      };
    }
    if (
      httpStatus === 403 &&
      (reasonUpper === "PERMISSION_DENIED" || reason === "PERMISSION_DENIED")
    ) {
      return {
        code: "GOOGLE_TASKS_PERMISSION_DENIED",
        httpStatus,
        reason,
        requiresReconnect: false,
        tasksScopeMissing: false,
        tasksApiDisabled: false,
        userMessage: "Google Tasks permission denied for this account.",
      };
    }
    // Bare 403 from Tasks is most often a missing tasks.readonly grant
    // (Calendar may still work). Do not flip the Calendar connection.
    if (httpStatus === 403) {
      return {
        code: "GOOGLE_TASKS_SCOPE_MISSING",
        httpStatus,
        reason,
        requiresReconnect: false,
        tasksScopeMissing: true,
        tasksApiDisabled: false,
        userMessage:
          "Reconnect Google to grant Google Tasks access (tasks.readonly).",
      };
    }
    return {
      code: "GOOGLE_TASKS_API_ERROR",
      httpStatus,
      reason,
      requiresReconnect: false,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage: "Could not load Google Tasks. Try Sync again.",
    };
  }

  // Calendar / OAuth surfaces
  if (httpStatus === 401 || isScopeInsufficient) {
    return {
      code: "GOOGLE_AUTH_EXPIRED",
      httpStatus,
      reason,
      requiresReconnect: true,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage:
        "Reconnect Google Calendar in Settings (permissions may be required).",
    };
  }

  if (httpStatus === 403) {
    // Calendar primary 403 often means revoked/insufficient calendar scopes.
    return {
      code: "GOOGLE_CALENDAR_API_ERROR",
      httpStatus,
      reason,
      requiresReconnect: true,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage:
        "Reconnect Google Calendar in Settings (permissions may be required).",
    };
  }

  if (surface === "oauth") {
    return {
      code: "GOOGLE_TOKEN_REFRESH_FAILED",
      httpStatus,
      reason,
      requiresReconnect: true,
      tasksScopeMissing: false,
      tasksApiDisabled: false,
      userMessage: "Reconnect Google Calendar — token refresh failed.",
    };
  }

  return {
    code: "GOOGLE_CALENDAR_API_ERROR",
    httpStatus,
    reason,
    requiresReconnect: false,
    tasksScopeMissing: false,
    tasksApiDisabled: false,
    userMessage: "Could not load Google Calendar events. Try Sync again.",
  };
}

/** Safe fields for structured logging (never tokens). */
export function googleErrorLogFields(err: unknown, classified: ClassifiedGoogleError) {
  return {
    code: classified.code,
    httpStatus: classified.httpStatus,
    reason: classified.reason,
    requiresReconnect: classified.requiresReconnect,
    message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
  };
}
