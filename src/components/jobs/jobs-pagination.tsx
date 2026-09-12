"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pushWithProgress } from "@/lib/navigate";

export function JobsPagination({
  page,
  pageSize,
  totalPages,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (totalCount === 0) return null;

  function pushPatch(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "" || (key === "page" && value === "1") || (key === "pageSize" && value === "10")) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    startTransition(() => {
      pushWithProgress(router, qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function go(next: number) {
    pushPatch({ page: next <= 1 ? null : String(next) });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-sb-muted">
        Showing page {page} of {totalPages} · {totalCount} job
        {totalCount === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-sb-muted">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            value={pageSize}
            disabled={pending}
            onChange={(e) =>
              pushPatch({ pageSize: e.target.value, page: null })
            }
            className="h-9 rounded-[8px] border border-sb-border bg-white px-2 text-sb-ink outline-none"
          >
            {[5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || page <= 1}
            onClick={() => go(page - 1)}
            className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] font-medium text-sb-ink disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <button
            type="button"
            disabled={pending || page >= totalPages}
            onClick={() => go(page + 1)}
            className="inline-flex h-9 items-center gap-1 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] font-medium text-sb-ink disabled:opacity-40"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
