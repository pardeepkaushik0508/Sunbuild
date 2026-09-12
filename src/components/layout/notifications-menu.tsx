"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  tone?: "danger" | "warning" | "info";
};

function viewAllForPath(pathname: string) {
  if (pathname.startsWith("/client")) return "/client/change-orders";
  if (pathname.startsWith("/sub")) return "/sub";
  if (pathname.startsWith("/pm")) return "/pm/change-orders";
  if (pathname.startsWith("/sales")) return "/sales";
  if (pathname.startsWith("/bookkeeper")) return "/bookkeeper/invoices";
  return "/owner/alerts";
}

export function NotificationsMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewAllHref = viewAllForPath(pathname);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { items: NotificationItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  // Load on mount + refresh periodically so the bell badge stays accurate
  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Refresh when opening the panel
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Refresh after route changes (e.g. after approving a CO)
  useEffect(() => {
    void load();
  }, [pathname, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const unread = items.length > 0;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-sb-border text-sb-muted hover:bg-sb-canvas sm:inline-flex"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} />
        {unread ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sb-orange" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-[60] mt-2 w-[320px] overflow-hidden rounded-[14px] border border-sb-border bg-sb-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-sb-border px-4 py-3">
            <p className="text-sm font-semibold text-sb-ink">Notifications</p>
            <Link
              href={viewAllHref}
              onClick={() => setOpen(false)}
              className="text-[12px] font-medium text-sb-blue hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {loading && !fetched ? (
              <p className="px-4 py-8 text-center text-sm text-sb-muted">
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-sb-muted">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="border-b border-sb-border-subtle last:border-0"
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 transition hover:bg-sb-canvas"
                    >
                      <p className="text-sm font-medium text-sb-ink">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-sb-muted">
                        {item.body}
                      </p>
                      {item.tone ? (
                        <span
                          className={cn(
                            "mt-1 inline-block text-[10px] font-bold uppercase",
                            item.tone === "danger" && "text-sb-red",
                            item.tone === "warning" && "text-sb-orange",
                            item.tone === "info" && "text-sb-blue"
                          )}
                        >
                          {item.tone}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
