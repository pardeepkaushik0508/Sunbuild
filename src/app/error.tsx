"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-sb-canvas px-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-sb-red">
        Error
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-sb-ink sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-sm text-sb-muted">
        An unexpected error occurred. You can try again, or return to a safe
        page.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-[10px] bg-[#1f2937] px-5 text-sm font-medium text-white hover:bg-black"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-[10px] border border-[#d1d5db] bg-white px-5 text-sm font-medium text-[#4b5563] hover:bg-sb-canvas"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
