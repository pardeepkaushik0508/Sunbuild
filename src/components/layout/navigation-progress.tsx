"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  getNavigationProgress,
  startNavigationProgress,
  stopNavigationProgress,
  subscribeNavigationProgress,
} from "@/lib/navigation-progress";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function shouldHandleAnchor(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash !== ""
    ) {
      return false;
    }
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash === ""
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function useNavigationActive() {
  return useSyncExternalStore(
    subscribeNavigationProgress,
    getNavigationProgress,
    () => false
  );
}

/**
 * Global navigation feedback: top progress bar + delayed center loader
 * so slow page transitions feel intentional rather than stuck.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = useNavigationActive();
  const [showOverlay, setShowOverlay] = useState(false);

  // Route settled — hide loader
  useEffect(() => {
    stopNavigationProgress();
  }, [pathname, searchParams]);

  // Capture internal link clicks (covers next/link and plain anchors)
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldHandleAnchor(anchor, event)) return;
      startNavigationProgress();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Show center overlay only when navigation is noticeably slow
  useEffect(() => {
    if (!active) {
      setShowOverlay(false);
      return;
    }
    const timer = setTimeout(() => setShowOverlay(true), 180);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[3px] overflow-hidden"
        role="progressbar"
        aria-valuetext="Loading page"
        aria-busy="true"
      >
        <div className="sb-nav-progress h-full w-full origin-left bg-sb-orange shadow-[0_0_8px_rgba(249,115,22,0.55)]" />
      </div>

      {showOverlay ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-sb-ink/15 backdrop-blur-[1px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 rounded-[12px] border border-sb-border bg-sb-surface px-4 py-3 shadow-[var(--sb-shadow)]">
            <Loader2
              className="h-5 w-5 animate-spin text-sb-orange"
              aria-hidden
            />
            <span className="text-sm font-medium text-sb-body">Loading…</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
