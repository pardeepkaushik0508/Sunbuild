"use client";

import { Printer } from "lucide-react";

/** Client-only print trigger for HTML print views. */
export function PrintPageButton({
  label = "Print / Save to PDF",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-neutral-800"
    >
      <Printer className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
