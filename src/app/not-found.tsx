import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-sb-canvas px-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-sb-orange">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-sb-ink sm:text-3xl">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-sb-muted">
        The page you requested does not exist, or you do not have access to it.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-[10px] bg-[#1f2937] px-5 text-sm font-medium text-white hover:bg-black"
        >
          Go home
        </Link>
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-[10px] border border-[#d1d5db] bg-white px-5 text-sm font-medium text-[#4b5563] hover:bg-sb-canvas"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
