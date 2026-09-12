import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getMicrosoftAccountProfile,
  saveMicrosoftConnection,
} from "@/lib/microsoft/todo";
import {
  parseAndVerifyOAuthState,
  safeReturnPath,
} from "@/lib/google/oauth-state";
import { requireApiSession } from "@/lib/session";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";

function errorRedirect(
  requestUrl: string,
  returnTo: string,
  message: string
) {
  const dest = new URL(returnTo, requestUrl);
  dest.searchParams.set("microsoft", "error");
  dest.searchParams.set("message", message.slice(0, 180));
  return NextResponse.redirect(dest);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let returnTo = "/settings";

  try {
    const session = await requireApiSession();

    if (!state) {
      return errorRedirect(
        url.origin,
        returnTo,
        "Missing OAuth state. Please try connecting again."
      );
    }

    let payload;
    try {
      payload = parseAndVerifyOAuthState(state);
    } catch (err) {
      const message =
        err instanceof AppError
          ? err.message
          : "Invalid OAuth state. Please try connecting again.";
      return errorRedirect(url.origin, returnTo, message);
    }

    if (
      payload.userId !== session.user.id ||
      payload.companyId !== session.membership.companyId
    ) {
      return errorRedirect(
        url.origin,
        returnTo,
        "OAuth state does not match your session. Please try connecting again."
      );
    }
    returnTo = safeReturnPath(payload.returnTo, returnTo);

    if (oauthError) {
      const desc = url.searchParams.get("error_description") || "";
      let message = "Could not connect Microsoft To Do";
      if (oauthError === "access_denied") {
        message = "Microsoft To Do connection was cancelled.";
      } else if (oauthError === "server_error") {
        message =
          "Microsoft returned a temporary server error. Wait a moment and click Connect again.";
      } else if (/userAudience/i.test(desc) || /\/common\//i.test(desc)) {
        message =
          "Azure app audience mismatch. Use MICROSOFT_TENANT_ID=consumers for personal accounts.";
      } else if (desc) {
        message = desc.slice(0, 180);
      }
      return errorRedirect(url.origin, returnTo, message);
    }

    if (!code) {
      return errorRedirect(
        url.origin,
        returnTo,
        "Missing authorization code. Please try connecting again."
      );
    }

    const tokens = await exchangeCodeForTokens(code);
    const profile = await getMicrosoftAccountProfile(tokens.access_token);

    await saveMicrosoftConnection({
      userId: session.user.id,
      companyId: session.membership.companyId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      email: profile.email,
      accountId: profile.accountId,
    });

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "MICROSOFT_TODO_CONNECTED",
      entityType: "MicrosoftTodoConnection",
      entityId: session.user.id,
      metadata: { email: profile.email ?? null },
    }).catch(() => undefined);

    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("microsoft", "connected");
    return NextResponse.redirect(dest);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const message =
      err instanceof AppError
        ? err.message
        : "Could not connect Microsoft To Do";
    // Never log tokens/codes. Safe operational signal only.
    console.error("[microsoft-todo] callback failed:", message);
    return errorRedirect(url.origin, returnTo, message);
  }
}
