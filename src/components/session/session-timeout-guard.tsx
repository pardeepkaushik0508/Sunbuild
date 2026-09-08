"use client";

import { useEffect, useRef } from "react";
import { signOutAndRedirect } from "@/lib/auth-sign-out";

/**
 * Idle session timeout based on company settings.
 * Signs out securely and returns to login when inactive.
 */
export function SessionTimeoutGuard({
  timeoutMinutes,
}: {
  timeoutMinutes: number;
}) {
  const lastActive = useRef(Date.now());
  const loggingOut = useRef(false);

  useEffect(() => {
    const ms = Math.max(1, timeoutMinutes) * 60 * 1000;

    function touch() {
      lastActive.current = Date.now();
    }

    async function logout() {
      if (loggingOut.current) return;
      loggingOut.current = true;
      await signOutAndRedirect();
    }

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
    document.addEventListener("visibilitychange", touch, { passive: true });

    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastActive.current >= ms) {
        void logout();
      }
    }, 15_000);

    return () => {
      for (const ev of windowEvents) {
        window.removeEventListener(ev, touch);
      }
      document.removeEventListener("visibilitychange", touch);
      window.clearInterval(id);
    };
  }, [timeoutMinutes]);

  return null;
}
