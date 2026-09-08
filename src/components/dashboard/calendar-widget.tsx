"use client";

import { useMemo, useState } from "react";
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
  type?: "task" | "schedule" | "milestone" | "deposit" | "inspection";
  meta?: string;
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
      <path fill="#4285F4" d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
      <path fill="#fff" d="M19 20H5V9h14v11z" />
      <path fill="#EA4335" d="M7 12h2v2H7zm0 4h2v2H7z" />
      <path fill="#FBBC05" d="M11 12h2v2h-2zm0 4h2v2h-2z" />
      <path fill="#34A853" d="M15 12h2v2h-2zm0 4h2v2h-2z" />
    </svg>
  );
}

export function CalendarWidget({
  events = [],
  highlightDays,
  subtitle = "Project schedule overview",
}: {
  events?: CalendarEvent[];
  /** @deprecated prefer events */
  highlightDays?: number[];
  subtitle?: string;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(new Date(ev.date), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const selectedKey = format(selected, "yyyy-MM-dd");
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const legacyHighlights = new Set(highlightDays ?? []);

  return (
    <section className="flex h-full min-h-[320px] flex-col rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)]">
      <div className="mb-4 flex items-start justify-between gap-2">
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
            href={`https://calendar.google.com/calendar/u/0/r/month/${format(cursor, "yyyy")}/${format(cursor, "M")}/1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sb-canvas"
            title="Open in Google Calendar"
            aria-label="Open in Google Calendar"
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

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[#9ca3af]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
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
                !isSelected && hasEvents && inMonth && "font-semibold text-[#6d28d9]"
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

      <div className="mt-3 min-h-[72px] border-t border-sb-border pt-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-sb-muted">
          {format(selected, "MMM d")}
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-[12px] text-sb-muted">No events this day.</p>
        ) : (
          <ul className="max-h-24 space-y-1 overflow-y-auto">
            {selectedEvents.slice(0, 4).map((ev) => (
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
