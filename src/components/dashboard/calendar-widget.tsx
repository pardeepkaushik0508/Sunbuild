"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { calendarDayKey, crmEventMeta } from "@/lib/google/event-display";
import { DASHBOARD_WIDGET_SHELL } from "@/components/dashboard/dashboard-widget-row";

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  type?:
    | "task"
    | "schedule"
    | "milestone"
    | "deposit"
    | "inspection"
    | "meeting"
    | "google";
  meta?: string;
  /** Internal source; google = external personal/work calendar event */
  source?: "sunbuild" | "google";
  googleEventId?: string;
};

function GoogleCalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      width={20}
      height={20}
    >
      <path
        fill="#4285F4"
        d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
      />
      <path fill="#fff" d="M19 20H5V9h14v11z" />
      <path fill="#EA4335" d="M7 12h2v2H7zm0 4h2v2H7z" />
      <path fill="#FBBC05" d="M11 12h2v2h-2zm0 4h2v2h-2z" />
      <path fill="#34A853" d="M15 12h2v2h-2zm0 4h2v2h-2z" />
    </svg>
  );
}

function eventSourceLabel(ev: CalendarEvent): string {
  if (ev.source === "google" || ev.type === "google") {
    return ev.meta && /google calendar/i.test(ev.meta)
      ? ev.meta
      : "Google Calendar";
  }
  return crmEventMeta(ev.meta);
}

export function CalendarWidget({
  events = [],
  highlightDays,
  subtitle = "Project schedule overview",
  googleConnected = false,
  googleReconnectRequired = false,
  connectReturnPath = "/",
}: {
  events?: CalendarEvent[];
  /** @deprecated prefer events */
  highlightDays?: number[];
  subtitle?: string;
  /** When false, Google icon starts OAuth connect instead of opening calendar.google.com */
  googleConnected?: boolean;
  googleReconnectRequired?: boolean;
  /** Path to return to after OAuth (must be same-origin relative). */
  connectReturnPath?: string;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [reconnectNeeded, setReconnectNeeded] = useState(
    googleReconnectRequired
  );

  const fetchGoogleEvents = useCallback(
    async (
      around: Date,
      opts?: { silent?: boolean; force?: boolean }
    ) => {
      if (!googleConnected) {
        setGoogleEvents([]);
        setSyncError(null);
        return;
      }
      // Manual Sync always attempts even if a prior poll marked reconnect.
      if (reconnectNeeded && !opts?.force) {
        setGoogleEvents([]);
        return;
      }
      if (!opts?.silent) setSyncing(true);
      const ac = new AbortController();
      const timeout = window.setTimeout(() => ac.abort(), 45_000);
      try {
        const qs = new URLSearchParams({
          around: around.toISOString(),
        });
        if (opts?.force) qs.set("force", "1");
        const res = await fetch(`/api/google/calendar/events?${qs}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: ac.signal,
        });
        if (res.status === 401) {
          setGoogleEvents([]);
          setSyncError("Sign in again to sync Google Calendar.");
          return;
        }
        if (res.status === 403) {
          setGoogleEvents([]);
          setSyncError("Google Calendar is not available for this role.");
          return;
        }
        const data = (await res.json()) as {
          events?: CalendarEvent[];
          reconnectRequired?: boolean;
          error?: boolean;
          count?: number;
        };
        if (data.reconnectRequired) {
          setReconnectNeeded(true);
          setGoogleEvents([]);
          setSyncError(
            "Reconnect Google Calendar in Settings (new permissions may be required)."
          );
          return;
        }
        if (data.error && (!data.events || data.events.length === 0)) {
          setSyncError("Could not load Google Calendar events. Try Sync again.");
          setGoogleEvents([]);
          return;
        }
        setReconnectNeeded(false);
        setSyncError(null);
        setGoogleEvents(Array.isArray(data.events) ? data.events : []);
      } catch {
        setSyncError("Google Calendar sync timed out. Click Sync to retry.");
      } finally {
        window.clearTimeout(timeout);
        if (!opts?.silent) setSyncing(false);
      }
    },
    [googleConnected, reconnectNeeded]
  );

  const handleSyncClick = useCallback(() => {
    if (!googleConnected) return;
    setReconnectNeeded(false);
    setSyncError(null);
    void fetchGoogleEvents(cursor, { force: true });
  }, [googleConnected, cursor, fetchGoogleEvents]);

  useEffect(() => {
    void fetchGoogleEvents(cursor);
  }, [cursor, fetchGoogleEvents]);

  useEffect(() => {
    if (!googleConnected || reconnectNeeded) return;
    const id = window.setInterval(() => {
      void fetchGoogleEvents(cursor, { silent: true });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [googleConnected, reconnectNeeded, cursor, fetchGoogleEvents]);

  useEffect(() => {
    setReconnectNeeded(googleReconnectRequired);
    if (!googleReconnectRequired) setSyncError(null);
  }, [googleReconnectRequired]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const mergedEvents = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    const byGoogleId = new Set<string>();

    for (const ev of events) {
      byId.set(ev.id, {
        ...ev,
        source: ev.source ?? "sunbuild",
        meta: ev.source === "google" ? ev.meta : crmEventMeta(ev.meta),
      });
      if (ev.googleEventId) byGoogleId.add(ev.googleEventId);
    }
    for (const ev of googleEvents) {
      if (ev.googleEventId && byGoogleId.has(ev.googleEventId)) continue;
      if (byId.has(ev.id)) continue;
      byId.set(ev.id, {
        ...ev,
        source: "google",
        type: "google",
        meta: eventSourceLabel(ev),
      });
    }
    return Array.from(byId.values());
  }, [events, googleEvents]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of mergedEvents) {
      const key = calendarDayKey(ev.date, {
        allDay:
          ev.type === "google" && /^\d{4}-\d{2}-\d{2}$/.test(ev.date),
      });
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [mergedEvents]);

  const monthEventCount = useMemo(() => {
    let count = 0;
    for (const [key, list] of eventsByDay) {
      const [y, m] = key.split("-").map(Number);
      if (
        y === cursor.getFullYear() &&
        m === cursor.getMonth() + 1
      ) {
        count += list.length;
      }
    }
    return count;
  }, [eventsByDay, cursor]);

  const monthGoogleCount = useMemo(() => {
    let count = 0;
    for (const [key, list] of eventsByDay) {
      const [y, m] = key.split("-").map(Number);
      if (y !== cursor.getFullYear() || m !== cursor.getMonth() + 1) continue;
      count += list.filter(
        (ev) => ev.source === "google" || ev.type === "google"
      ).length;
    }
    return count;
  }, [eventsByDay, cursor]);

  // Keep the selected day inside the visible month so the list matches the grid.
  useEffect(() => {
    setSelected((prev) => {
      if (isSameMonth(prev, cursor)) return prev;
      const today = new Date();
      if (isSameMonth(today, cursor)) return today;
      let firstEventDay: Date | null = null;
      for (const [key] of eventsByDay) {
        const [y, m, d] = key.split("-").map(Number);
        if (y !== cursor.getFullYear() || m !== cursor.getMonth() + 1) continue;
        const day = new Date(y, m - 1, d);
        if (!firstEventDay || day < firstEventDay) firstEventDay = day;
      }
      return firstEventDay ?? startOfMonth(cursor);
    });
  }, [cursor, eventsByDay]);

  const selectedKey = calendarDayKey(selected);
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const legacyHighlights = new Set(highlightDays ?? []);

  const needsConnect = !googleConnected || reconnectNeeded;
  const googleHref = needsConnect
    ? `/api/google/calendar/connect?returnTo=${encodeURIComponent(connectReturnPath)}`
    : `https://calendar.google.com/calendar/u/0/r/month/${format(cursor, "yyyy")}/${format(cursor, "M")}/1`;

  const googleTitle = reconnectNeeded
    ? "Reconnect Google Calendar"
    : googleConnected
      ? syncing
        ? "Syncing Google Calendar…"
        : "Open in Google Calendar"
      : "Connect Google Calendar";

  const subtitleText = syncing
    ? "Syncing Google Calendar…"
    : monthEventCount > 0
      ? `${monthEventCount} event${monthEventCount === 1 ? "" : "s"} this month${
          monthGoogleCount > 0
            ? ` · ${monthGoogleCount} from Google`
            : ""
        }`
      : googleConnected && !reconnectNeeded
        ? `${subtitle} · no events this month`
        : subtitle;

  return (
    <section className={DASHBOARD_WIDGET_SHELL}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ede9fe] text-[#8b5cf6]">
            <CalendarDays size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-sb-ink">
              {format(cursor, "MMMM yyyy")}
            </h3>
            <p className="text-[12px] text-sb-muted">{subtitleText}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {googleConnected ? (
            <button
              type="button"
              onClick={handleSyncClick}
              disabled={syncing}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border border-sb-border bg-white px-2.5 text-[12px] font-medium text-sb-ink transition hover:bg-sb-canvas",
                syncing && "cursor-wait opacity-70"
              )}
              title="Sync Google Calendar now"
              aria-label="Sync Google Calendar"
            >
              <RefreshCw
                size={14}
                className={cn(syncing && "animate-spin")}
              />
              Sync
            </button>
          ) : null}
          <a
            href={googleHref}
            target={!needsConnect ? "_blank" : undefined}
            rel={!needsConnect ? "noopener noreferrer" : undefined}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sb-canvas"
            title={googleTitle}
            aria-label={googleTitle}
          >
            <GoogleCalIcon />
          </a>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sb-muted hover:bg-sb-canvas"
            onClick={() => setCursor((c) => subMonths(c, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sb-muted hover:bg-sb-canvas"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {syncError ? (
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          <span className="min-w-0 truncate">{syncError}</span>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            onClick={handleSyncClick}
          >
            Sync
          </button>
        </div>
      ) : null}

      <div className="grid shrink-0 grid-cols-7 gap-1 text-center text-[11px] text-[#9ca3af]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = calendarDayKey(day);
          const inMonth = isSameMonth(day, cursor);
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, new Date());
          const dayEvents = eventsByDay.get(key) ?? [];
          const hasEvents =
            dayEvents.length > 0 ||
            (inMonth && legacyHighlights.has(day.getDate()));
          const hasGoogle = dayEvents.some(
            (ev) => ev.source === "google" || ev.type === "google"
          );
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelected(day);
                if (!inMonth) setCursor(startOfMonth(day));
              }}
              className={cn(
                "relative flex h-9 flex-col items-center justify-center rounded-lg text-sm transition",
                !inMonth && "text-[#d1d5db]",
                inMonth && !isSelected && !hasEvents && "text-sb-ink hover:bg-sb-canvas",
                inMonth &&
                  !isSelected &&
                  hasEvents &&
                  (hasGoogle
                    ? "bg-[#e8f0fe] font-semibold text-[#1a73e8]"
                    : "bg-[#f3e8ff] font-semibold text-[#6d28d9]"),
                isSelected && "bg-[#1f2937] font-semibold text-white",
                isToday &&
                  !isSelected &&
                  "ring-1 ring-inset ring-sb-orange/70"
              )}
              aria-label={`${format(day, "MMMM d, yyyy")}${
                hasEvents ? `, ${dayEvents.length} events` : ""
              }`}
              aria-pressed={isSelected}
            >
              <span className="leading-none">{format(day, "d")}</span>
              {hasEvents ? (
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full",
                    isSelected
                      ? "bg-white"
                      : hasGoogle
                        ? "bg-[#1a73e8]"
                        : "bg-[#8b5cf6]"
                  )}
                />
              ) : (
                <span className="mt-0.5 h-1 w-1" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-sb-border pt-3">
        <p className="mb-1.5 shrink-0 text-[11px] font-medium uppercase tracking-wide text-sb-muted">
          {format(selected, "MMM d")}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-[12px] text-sb-muted">No events this day.</p>
        ) : (
          <ul className="min-h-0 max-h-36 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {selectedEvents.map((ev) => {
              const fromGoogle =
                ev.source === "google" || ev.type === "google";
              return (
                <li key={ev.id} className="text-[12px] text-sb-ink">
                  <div className="flex items-start gap-1.5">
                    {fromGoogle ? (
                      <span className="mt-0.5 shrink-0">
                        <GoogleCalIcon className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{ev.title}</span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px]",
                          fromGoogle ? "text-[#4285F4]" : "text-sb-muted"
                        )}
                      >
                        {fromGoogle
                          ? "(Google Calendar)"
                          : `(${eventSourceLabel(ev)})`}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
