"use client";

import {
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InteractiveColumn = {
  key: string;
  label: string;
  /** Defaults to true when key is non-empty */
  sortable?: boolean;
  className?: string;
};

export type InteractiveRow = {
  id: string;
  searchText: string;
  sortValues?: Record<string, string | number | null | undefined>;
  cells: ReactNode[];
};

const DEFAULT_PAGE_SIZES = [5, 10, 25, 50] as const;

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function InteractiveDataTable({
  columns,
  rows,
  searchPlaceholder = "Search…",
  defaultPageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  emptyMessage = "No results found",
  className,
  tableClassName,
  toolbarExtra,
}: {
  columns: InteractiveColumn[];
  rows: InteractiveRow[];
  searchPlaceholder?: string;
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
  emptyMessage?: string;
  className?: string;
  tableClassName?: string;
  toolbarExtra?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.searchText.toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const next = [...filtered];
    next.sort((a, b) => {
      const cmp = compareValues(
        a.sortValues?.[sortKey],
        b.sortValues?.[sortKey]
      );
      return sortDir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function onSearchChange(value: string) {
    startTransition(() => {
      setQuery(value);
      setPage(1);
    });
  }

  function onPageSizeChange(value: number) {
    startTransition(() => {
      setPageSize(value);
      setPage(1);
    });
  }

  function toggleSort(key: string) {
    startTransition(() => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(1);
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sb-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-[10px] border border-sb-border bg-white pl-9 pr-3 text-sm text-sb-ink outline-none placeholder:text-sb-muted focus:border-sb-orange/50 focus:ring-2 focus:ring-sb-orange/20"
            aria-label={searchPlaceholder}
          />
        </label>
        {toolbarExtra ? <div className="shrink-0">{toolbarExtra}</div> : null}
      </div>

      <div
        className={cn(
          "overflow-x-auto rounded-[16px] border border-sb-border bg-white shadow-[var(--sb-shadow)]",
          tableClassName
        )}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-sb-border bg-[#fafafa] text-[11px] uppercase tracking-wide text-sb-muted">
            <tr>
              {columns.map((col) => {
                const sortable =
                  col.sortable ?? Boolean(col.key && col.key.length > 0);
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key || col.label}
                    className={cn(
                      "whitespace-nowrap px-4 py-3.5 font-semibold",
                      col.className
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1.5 text-left uppercase tracking-wide transition hover:text-sb-ink"
                        aria-sort={
                          active
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp size={13} aria-hidden />
                          ) : (
                            <ArrowDown size={13} aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown
                            size={13}
                            className="opacity-40"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-sb-border-subtle">
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-sb-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, i) => (
                    <FragmentCell key={`${row.id}-${i}`}>{cell}</FragmentCell>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-col gap-3 border-t border-sb-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sb-muted">
            {total === 0
              ? "0 results"
              : `Showing ${start + 1}–${Math.min(start + pageSize, total)} of ${total}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sb-muted">
              <span className="whitespace-nowrap">Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-9 rounded-[8px] border border-sb-border bg-white px-2 text-sb-ink outline-none focus:border-sb-orange/50"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] font-medium text-sb-ink disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="min-w-[4.5rem] text-center text-sb-muted">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages || total === 0}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] font-medium text-sb-ink disabled:opacity-40"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ensures Td nodes render as real <td> children of <tr>. */
function FragmentCell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
