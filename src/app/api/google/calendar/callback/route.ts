import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getGoogleAccountEmail,
  saveGoogleConnection,
} from "@/lib/google/calendar";
import {
  parseAndVerifyOAuthState,
  safeReturnPath,
} from "@/lib/google/oauth-state";
import { requireApiSession } from "@/lib/session";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let returnTo = "/settings";

  try {
    const session = await requireApiSession();

    if (!state) {
      throw new AppError("Missing OAuth state", 400, "OAUTH_STATE");
    }
    const payload = parseAndVerifyOAuthState(state);
    if (
      payload.userId !== session.user.id ||
      payload.companyId !== session.membership.companyId
    ) {
      throw new AppError("OAuth state does not match session", 403, "OAUTH_STATE");
    }
    returnTo = safeReturnPath(payload.returnTo, returnTo);

    if (oauthError) {
      const dest = new URL(returnTo, url.origin);
      dest.searchParams.set("google", "error");
      dest.searchParams.set(
        "message",
        oauthError === "access_denied"
          ? "Google Calendar connection was cancelled."
          : "Could not connect Google Calendar"
      );
      return NextResponse.redirect(dest);
    }

    if (!code) {
      throw new AppError("Missing authorization code", 400, "OAUTH_CODE");
    }

    const tokens = await exchangeCodeForTokens(code);
    const email = tokens.access_token
      ? await getGoogleAccountEmail(tokens.access_token)
      : null;

    await saveGoogleConnection({
      userId: session.user.id,
      companyId: session.membership.companyId,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      email,
    });

    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      action: "GOOGLE_CALENDAR_CONNECTED",
      entityType: "GoogleCalendarConnection",
      entityId: session.user.id,
      metadata: { email: email ?? null },
    });

    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("google", "connected");
    return NextResponse.redirect(dest);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const message =
      err instanceof AppError
        ? err.message
        : "Could not connect Google Calendar";
    // Never include tokens/codes in redirect.
    const dest = new URL(returnTo, url.origin);
    dest.searchParams.set("google", "error");
    dest.searchParams.set("message", message.slice(0, 180));
    return NextResponse.redirect(dest);
  }
}
