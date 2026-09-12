/**
 * Application security errors. Messages are safe to show to clients.
 * Never attach stack traces, SQL, or internal details to these.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

/** Safe client-facing message; logs detail server-side when needed. */
export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) {
    const msg = error.message?.trim() || "";
    // Preserve intentional Forbidden/Not found throws from legacy code
    if (/Body exceeded .+ limit/i.test(msg)) {
      return "File is too large to upload. Please use a smaller PDF (max 20 MB).";
    }
    if (/too many requests/i.test(msg)) {
      return "Too many requests. Please try again later.";
    }
    if (
      msg === "Forbidden" ||
      msg.startsWith("Forbidden:") ||
      msg.startsWith("You do not have permission") ||
      msg === "Not found" ||
      msg === "Lead not found" ||
      msg === "Contract not found" ||
      msg === "File required" ||
      msg === "PDF file required" ||
      msg === "Note required" ||
      msg === "Section locked" ||
      msg === "Warranty not active for this project" ||
      msg === "Title is required" ||
      msg === "Invalid status" ||
      msg.startsWith("File too large") ||
      msg.startsWith("File is too large") ||
      msg.startsWith("Invalid ") ||
      msg.startsWith("Valid ") ||
      msg.startsWith("End date") ||
      msg.startsWith("Could not update") ||
      /already exists/i.test(msg) ||
      /already in use/i.test(msg) ||
      /could not be sent/i.test(msg) ||
      /permission/i.test(msg) ||
      error.name === "AppError" ||
      error.name === "ForbiddenError" ||
      error.name === "RateLimitError" ||
      error.name === "NotFoundError"
    ) {
      return msg.startsWith("Forbidden:") ? "Forbidden" : msg;
    }
  }
  console.error("[sunbuild] unexpected error", error);
  return "Something went wrong. Please try again.";
}
