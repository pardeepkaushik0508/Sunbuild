"use client";

import { cn } from "@/lib/utils";

/** Jobs Management progress bar — orange fill on purple track (PDF). */
export function JobsProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cn(
        "h-3 w-full overflow-hidden rounded-full bg-[#8b5cf6]",
        className
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[#f97316] transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
