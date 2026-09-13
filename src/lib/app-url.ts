/**
 * Public application URL helpers.
 *
 * Keep two concepts separate:
 * - OAuth callback URI (GOOGLE_REDIRECT_URI / MICROSOFT_REDIRECT_URI)
 * - Post-OAuth browser redirects (settings pages, login, emails)
 *
 * Never use process.env.PORT to build a public/browser URL. On hosts like
 * Render, PORT is the internal listen port (often 10000) and is not the
 * public origin.
 */

function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function firstConfiguredOrigin(): string | null {
  for (const key of ["APP_URL", "NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL"] as const) {
    const raw = process.env[key]?.trim();
    if (raw) return trimOrigin(raw);
  }
  return null;
}

/**
 * True when `origin` looks like the process's internal listen address
 * (e.g. http://localhost:10000 when PORT=10000 on Render), not a public URL.
 */
export function isInternalListenOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.hostname === "0.0.0.0") return true;

    const listenPort = process.env.PORT?.trim();
    if (!listenPort) return false;

    const isLoopback =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "[::1]" ||
      u.hostname === "::1";

    if (!isLoopback) return false;

    const originPort = u.port || (u.protocol === "https:" ? "443" : "80");
    return originPort === listenPort;
  } catch {
    return true;
  }
}

/**
 * Resolve the public app origin for browser redirects and absolute links.
 *
 * Order:
 * 1. APP_URL / NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL (preferred, especially behind proxies)
 * 2. Incoming request origin, when it is not the internal listen address
 * 3. http://localhost:3000 (local default)
 */
export function getAppOrigin(request?: Request): string {
  const configured = firstConfiguredOrigin();
  if (configured) return configured;

  if (request) {
    try {
      const origin = new URL(request.url).origin;
      if (!isInternalListenOrigin(origin)) {
        return origin;
      }
    } catch {
      // fall through
    }
  }

  return "http://localhost:3000";
}

/** Build an absolute URL on the public app origin. */
export function appAbsoluteUrl(path: string, request?: Request): URL {
  const origin = getAppOrigin(request);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, `${origin}/`);
}
