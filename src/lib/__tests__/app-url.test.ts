/**
 * Unit tests for public app URL resolution (OAuth redirects).
 * Run: npx tsx --test src/lib/__tests__/app-url.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  appAbsoluteUrl,
  getAppOrigin,
  isInternalListenOrigin,
} from "../app-url";

const KEYS = [
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "BETTER_AUTH_URL",
  "PORT",
] as const;

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

function clearAppUrlEnv() {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreAppUrlEnv() {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("app-url", () => {
  afterEach(() => {
    restoreAppUrlEnv();
  });

  it("prefers APP_URL over request origin and PORT", () => {
    clearAppUrlEnv();
    process.env.APP_URL = "https://sunbuild.onrender.com";
    process.env.PORT = "10000";
    const request = new Request(
      "http://localhost:10000/api/google/calendar/callback?code=x"
    );
    assert.equal(getAppOrigin(request), "https://sunbuild.onrender.com");
    assert.equal(
      appAbsoluteUrl("/owner/settings?google=connected", request).href,
      "https://sunbuild.onrender.com/owner/settings?google=connected"
    );
  });

  it("uses local APP_URL for post-OAuth redirects", () => {
    clearAppUrlEnv();
    process.env.APP_URL = "http://localhost:3000";
    process.env.PORT = "10000";
    const request = new Request(
      "http://localhost:10000/api/google/calendar/callback"
    );
    assert.equal(
      appAbsoluteUrl("/owner/settings?google=connected", request).toString(),
      "http://localhost:3000/owner/settings?google=connected"
    );
    assert.equal(
      appAbsoluteUrl("/owner/settings?google=error", request).toString(),
      "http://localhost:3000/owner/settings?google=error"
    );
  });

  it("rejects internal listen origin when PORT matches localhost", () => {
    clearAppUrlEnv();
    process.env.PORT = "10000";
    assert.equal(isInternalListenOrigin("http://localhost:10000"), true);
    assert.equal(isInternalListenOrigin("http://127.0.0.1:10000"), true);
    assert.equal(isInternalListenOrigin("http://localhost:3000"), false);
    assert.equal(
      isInternalListenOrigin("https://sunbuild.onrender.com"),
      false
    );
  });

  it("falls back to localhost:3000 when request origin is internal PORT", () => {
    clearAppUrlEnv();
    process.env.PORT = "10000";
    const request = new Request(
      "http://localhost:10000/api/google/calendar/callback"
    );
    assert.equal(getAppOrigin(request), "http://localhost:3000");
  });

  it("uses request origin when safe and no env is set", () => {
    clearAppUrlEnv();
    const request = new Request(
      "http://localhost:3000/api/google/calendar/callback"
    );
    assert.equal(getAppOrigin(request), "http://localhost:3000");
  });

  it("never builds public URLs from process.env.PORT alone", () => {
    clearAppUrlEnv();
    process.env.PORT = "10000";
    assert.equal(getAppOrigin(), "http://localhost:3000");
    assert.doesNotMatch(getAppOrigin(), /:10000/);
  });
});
