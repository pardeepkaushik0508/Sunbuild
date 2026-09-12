import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { safeInternalPath } from "@/lib/safe-redirect";

const publicPaths = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/privacy",
  "/terms",
  "/api/auth",
];

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  return publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  response.headers.set("X-DNS-Prefetch-Control", "off");
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  return response;
}

/** Prevent browsers from caching authenticated HTML so Back after logout revalidates. */
function applyNoStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  if (
    isPublic ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/figma/") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".webp")
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = safeInternalPath(pathname);
    if (next !== "/") {
      url.searchParams.set("next", next);
    }
    return applyNoStore(applySecurityHeaders(NextResponse.redirect(url)));
  }

  return applyNoStore(applySecurityHeaders(NextResponse.next()));
}

export const config = {
  // Include API file routes (paths with dots) so cookie gate applies;
  // handlers still enforce full ACL + session validation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.svg$).*)"],
};
