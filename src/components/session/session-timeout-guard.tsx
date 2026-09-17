"use client";

import { useEffect, useRef } from "react";
import { signOutAndRedirect } from "@/lib/auth-sign-out";
import {
  clearSessionLastActive,
  readSessionLastActive,
  writeSessionLastActive,
} from "@/lib/session-activity";

const HEARTBEAT_MS = 2 * 60 * 1000;

/**
 * Idle session timeout based on company settings.
 * Persists last activity so reopen / new tab after the idle window logs out.
 * Also heartbeats the server so DB idle checks stay in sync while the tab is used.
 */
export function SessionTimeoutGuard({
  timeoutMinutes,
  userId,
}: {
  timeoutMinutes: number;
  userId: string;
}) {
  const lastActive = useRef(0);
  const loggingOut = useRef(false);
  const lastHeartbeat = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const ms = Math.max(1, timeoutMinutes) * 60 * 1000;
    const now = Date.now();
    const stored = readSessionLastActive();

    if (!stored || stored.userId !== userId) {
      lastActive.current = now;
      writeSessionLastActive(userId, now);
    } else {
      lastActive.current = stored.at;
    }

    function touch() {
      const t = Date.now();
      lastActive.current = t;
      writeSessionLastActive(userId, t);
      if (t - lastHeartbeat.current >= HEARTBEAT_MS) {
        lastHeartbeat.current = t;
        void fetch("/api/session/touch", {
          method: "POST",
          credentials: "same-origin",
        }).catch(() => undefined);
      }
    }

    async function logout() {
      if (loggingOut.current) return;
      loggingOut.current = true;
      clearSessionLastActive();
      await signOutAndRedirect();
    }

    function isExpired() {
      return Date.now() - lastActive.current >= ms;
    }

    if (isExpired()) {
      void logout();
      return;
    }

    // Initial server touch so the first long-lived page keeps the session warm.
    lastHeartbeat.current = Date.now();
    void fetch("/api/session/touch", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);

    const windowEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    for (const ev of windowEvents) {
      window.addEventListener(ev, touch, { passive: true });
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (isExpired()) {
        void logout();
        return;
      }
      touch();
    }
    document.addEventListener("visibilitychange", onVisibility);

    const id = window.setInterval(() => {
      if (isExpired()) {
        void logout();
      }
    }, 15_000);

    return () => {
      for (const ev of windowEvents) {
        window.removeEventListener(ev, touch);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(id);
    };
  }, [timeoutMinutes, userId]);

  return null;
}
