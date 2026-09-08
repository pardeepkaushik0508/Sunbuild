"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchHit = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
};

function typeLabel(type: string) {
  return type.replace(/_/g, " ");
}

export function GlobalSearch() {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panelOpen =
    focused && (query.trim().length > 0 || loading || hits.length > 0);
  const showHint = focused && query.trim().length > 0 && query.trim().length < 2;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) {
          inputRef.current?.focus();
          setFocused(true);
        } else {
          setMobileOpen(true);
        }
      }
      if (e.key === "Escape") {
        setFocused(false);
        setMobileOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const t = setTimeout(() => mobileInputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [mobileOpen]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function clearQuery() {
    setQuery("");
    setHits([]);
    inputRef.current?.focus();
    mobileInputRef.current?.focus();
  }

  function ResultsPanel({ className }: { className?: string }) {
    const q = query.trim();
    return (
      <div
        id={listId}
        role="listbox"
        className={cn(
          "overflow-hidden rounded-[14px] border border-sb-border bg-sb-surface shadow-lg",
          className
        )}
      >
        <div className="max-h-[min(50vh,360px)] overflow-y-auto p-1.5">
          {loading ? (
            <p className="px-3 py-4 text-center text-sm text-sb-muted">
              Searching…
            </p>
          ) : q.length > 0 && q.length < 2 ? (
            <p className="px-3 py-4 text-center text-sm text-sb-muted">
              Type at least 2 characters.
            </p>
          ) : q.length >= 2 && hits.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-sb-muted">
              No matches found.
            </p>
          ) : hits.length > 0 ? (
            <ul className="space-y-0.5">
              {hits.map((hit) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <Link
                    href={hit.href}
                    role="option"
                    onClick={() => {
                      setFocused(false);
                      setMobileOpen(false);
                      setQuery("");
                      setHits([]);
                    }}
                    className="flex flex-col rounded-[10px] px-3 py-2.5 transition hover:bg-sb-canvas"
                  >
                    <span className="text-sm font-medium text-sb-ink">
                      {hit.title}
                    </span>
                    <span className="text-[12px] capitalize text-sb-muted">
                      {typeLabel(hit.type)}
                      {hit.subtitle ? ` · ${hit.subtitle}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-center text-sm text-sb-muted">
              Search projects, tasks, leads, docs…
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={rootRef}
        className="relative mx-auto hidden max-w-xl flex-1 md:block"
      >
        <label className="flex h-10 w-full items-center gap-2 rounded-full border border-sb-border bg-sb-canvas px-4 text-sm text-sb-muted shadow-[inset_0_1px_2px_rgba(16,24,40,0.03)] transition focus-within:border-sb-orange/50 focus-within:bg-sb-surface focus-within:text-sb-ink">
          <Search size={16} className="shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Search projects, tasks, docs…"
            className="min-w-0 flex-1 bg-transparent text-sb-ink outline-none placeholder:text-sb-muted"
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={panelOpen || showHint}
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              className="rounded-md p-0.5 text-sb-muted hover:bg-sb-surface hover:text-sb-ink"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="rounded-md border border-sb-border bg-white px-1.5 py-0.5 text-[11px] text-sb-muted">
              /
            </kbd>
          )}
        </label>

        {(panelOpen || showHint) && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[60]">
            <ResultsPanel />
          </div>
        )}
      </div>

      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sb-border text-sb-muted hover:bg-sb-canvas md:hidden"
        aria-label="Search"
        onClick={() => setMobileOpen(true)}
      >
        <Search size={16} />
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-sb-surface md:hidden">
          <div className="flex items-center gap-2 border-b border-sb-border px-3 py-3">
            <Search size={16} className="shrink-0 text-sb-muted" />
            <input
              ref={mobileInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, tasks, docs…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Search"
            />
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setQuery("");
                setHits([]);
              }}
              className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
              aria-label="Close search"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <ResultsPanel className="border-0 shadow-none" />
          </div>
        </div>
      ) : null}
    </>
  );
}
