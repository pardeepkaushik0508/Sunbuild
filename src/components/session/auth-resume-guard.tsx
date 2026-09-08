"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * If Chrome/Safari restores a protected page from the back/forward cache
 * after logout, the painted dashboard can reappear without a network
 * round-trip. Re-check the session on bfcache restore and force login
 * when the cookie/session is gone. Middleware + Cache-Control: no-store
 * handle normal (non-bfcache) Back navigations.
 */
export function AuthResumeGuard() {
  useEffect(() => {
    let cancelled = false;

    async function ensureStillSignedIn() {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;
        if (!data?.session) {
          window.location.replace("/login");
        }
      } catch {
        if (!cancelled) {
          window.location.replace("/login");
        }
      }
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void ensureStillSignedIn();
      }
    }

    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
