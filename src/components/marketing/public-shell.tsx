import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";

export function PublicHeader({
  ctaHref = "/login",
  ctaLabel = "Sign in",
}: {
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <header className="border-b border-sb-border/80 bg-sb-surface/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <BrandLogo href="/" wordmarkClassName="text-[26px]" />
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/privacy"
            className="hidden text-sb-muted hover:text-sb-ink sm:inline"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hidden text-sb-muted hover:text-sb-ink sm:inline"
          >
            Terms
          </Link>
          <Link
            href={ctaHref}
            className="inline-flex h-9 items-center rounded-[8px] bg-sb-orange px-4 text-[13px] font-semibold text-white hover:bg-sb-orange-dark"
          >
            {ctaLabel}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-sb-border bg-sb-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-sb-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {year} Sunbuild CRM · Sunview Homes</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/" className="hover:text-sb-ink">
            Home
          </Link>
          <Link href="/privacy" className="hover:text-sb-ink">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-sb-ink">
            Terms of Service
          </Link>
          <Link href="/login" className="hover:text-sb-ink">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#ffedd5_0%,_#f9fafb_42%,_#f9fafb_100%)]">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-wide text-sb-orange">
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-sb-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-sb-muted">Last updated: {updated}</p>
        <div className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed text-sb-body">
          {children}
        </div>
      </article>
    </PublicShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-sb-ink">{title}</h2>
      <div className="space-y-3 text-sb-body">{children}</div>
    </section>
  );
}
