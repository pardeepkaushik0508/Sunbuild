"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pushWithProgress } from "@/lib/navigate";

export function JobsPagination({
  page,
  totalPages,
  totalCount,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (totalCount === 0) return null;

  function go(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    const qs = params.toString();
    startTransition(() => {
      pushWithProgress(router, qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-sb-muted">
        Showing page {page} of {totalPages} · {totalCount} job
        {totalCount === 1 ? "" : "s"}
      </p>
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
  );
}
