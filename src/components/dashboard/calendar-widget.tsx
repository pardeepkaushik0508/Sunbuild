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
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** Stable local calendar day key (avoids UTC day-shift for date-only values). */
function dayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd");
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
  const [reconnectNeeded, setReconnectNeeded] = useState(
    googleReconnectRequired
  );

  const fetchGoogleEvents = useCallback(
    async (around: Date, opts?: { silent?: boolean }) => {
      if (!googleConnected || reconnectNeeded) {
        setGoogleEvents([]);
        return;
      }
      if (!opts?.silent) setSyncing(true);
      const ac = new AbortController();
      // Soft timeout so UI never waits forever
      const timeout = window.setTimeout(() => ac.abort(), 12_000);
      try {
        const res = await fetch(
          `/api/google/calendar/events?around=${encodeURIComponent(around.toISOString())}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: ac.signal,
          }
        );
        if (res.status === 401 || res.status === 403) {
          setGoogleEvents([]);
          return;
        }
        const data = (await res.json()) as {
          events?: CalendarEvent[];
          reconnectRequired?: boolean;
        };
        if (data.reconnectRequired) {
          setReconnectNeeded(true);
          setGoogleEvents([]);
          return;
        }
        setGoogleEvents(Array.isArray(data.events) ? data.events : []);
      } catch {
        // Keep local SUNBUILD events; Google sync is best-effort.
      } finally {
        window.clearTimeout(timeout);
        if (!opts?.silent) setSyncing(false);
      }
    },
    [googleConnected, reconnectNeeded]
  );

  // Live Google → SUNBUILD: load on mount + whenever visible month changes.
  useEffect(() => {
    void fetchGoogleEvents(cursor);
  }, [cursor, fetchGoogleEvents]);

  // Background poll (quiet) — every 2 min so new Google events appear.
  useEffect(() => {
    if (!googleConnected || reconnectNeeded) return;
    const id = window.setInterval(() => {
      void fetchGoogleEvents(cursor, { silent: true });
    }, 120_000);
    return () => window.clearInterval(id);
  }, [googleConnected, reconnectNeeded, cursor, fetchGoogleEvents]);

  useEffect(() => {
    setReconnectNeeded(googleReconnectRequired);
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
      byId.set(ev.id, ev);
      if (ev.googleEventId) byGoogleId.add(ev.googleEventId);
    }
    for (const ev of googleEvents) {
      if (ev.googleEventId && byGoogleId.has(ev.googleEventId)) continue;
      if (byId.has(ev.id)) continue;
      byId.set(ev.id, ev);
    }
    return Array.from(byId.values());
  }, [events, googleEvents]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of mergedEvents) {
      const key = dayKey(ev.date);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [mergedEvents]);

  const selectedKey = dayKey(selected);
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

  return (
    <section className="flex h-full min-h-[280px] max-h-[70vh] flex-col overflow-hidden rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)] sm:min-h-[320px] sm:max-h-[420px] xl:max-h-none xl:h-[420px]">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ede9fe] text-[#8b5cf6]">
            <CalendarDays size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-sb-ink">
              {format(cursor, "MMMM yyyy")}
            </h3>
            <p className="text-[12px] text-sb-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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

      <div className="grid shrink-0 grid-cols-7 gap-1 text-center text-[11px] text-[#9ca3af]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = dayKey(day);
          const inMonth = isSameMonth(day, cursor);
          const isSelected = isSameDay(day, selected);
          const hasEvents =
            (eventsByDay.get(key)?.length ?? 0) > 0 ||
            (inMonth && legacyHighlights.has(day.getDate()));
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelected(day);
                if (!inMonth) setCursor(startOfMonth(day));
              }}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-lg text-sm transition",
                !inMonth && "text-[#d1d5db]",
                inMonth && !isSelected && "text-sb-ink hover:bg-sb-canvas",
                isSelected && "bg-[#1f2937] font-semibold text-white",
                !isSelected &&
                  hasEvents &&
                  inMonth &&
                  "font-semibold text-[#6d28d9]"
              )}
              aria-label={format(day, "MMMM d, yyyy")}
              aria-pressed={isSelected}
            >
              {format(day, "d")}
              {hasEvents && !isSelected ? (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#8b5cf6]" />
              ) : null}
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
          <ul className="min-h-0 max-h-36 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
            {selectedEvents.map((ev) => (
              <li key={ev.id} className="truncate text-[12px] text-sb-ink">
                <span className="font-medium">{ev.title}</span>
                {ev.meta ? (
                  <span className="text-sb-muted"> · {ev.meta}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
