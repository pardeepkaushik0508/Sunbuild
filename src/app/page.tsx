import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, FolderKanban, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import {
  PublicFooter,
  PublicHeader,
} from "@/components/marketing/public-shell";
import { getSession, requireSession } from "@/lib/session";
import { ROLE_HOME } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sunbuild CRM",
  description:
    "Sunbuild CRM — construction project management for Sunview Homes. Schedule, documents, selections, and optional Google Calendar sync.",
};

export default async function HomePage() {
  const authSession = await getSession();
  if (authSession?.user) {
    const app = await requireSession();
    redirect(ROLE_HOME[app.membership.role]);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#ffedd5_0%,_#f9fafb_42%,_#f9fafb_100%)]">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-5xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-xl">
            <BrandLogo href={null} wordmarkClassName="text-[42px] sm:text-[52px]" />
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-sb-ink sm:text-4xl">
              Construction CRM for Sunview Homes
            </h1>
            <p className="mt-4 text-base leading-relaxed text-sb-muted sm:text-lg">
              Manage jobs, schedules, documents, client selections, and field
              collaboration in one place. Connect Google Calendar when you want
              meetings and site visits on your personal calendar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-[10px] bg-sb-orange px-5 text-sm font-semibold text-white hover:bg-sb-orange-dark"
              >
                Sign in to Sunbuild
              </Link>
              <Link
                href="/privacy"
                className="inline-flex h-11 items-center rounded-[10px] border border-sb-border bg-sb-surface px-5 text-sm font-semibold text-sb-body hover:bg-white"
              >
                Privacy Policy
              </Link>
            </div>
          </div>

          <ul className="grid w-full max-w-md gap-4">
            <Feature
              icon={<FolderKanban className="h-5 w-5" aria-hidden />}
              title="Project command center"
              body="Jobs, tasks, RFIs, change orders, and documents for every build."
            />
            <Feature
              icon={<CalendarDays className="h-5 w-5" aria-hidden />}
              title="Optional Google Calendar"
              body="Sync eligible activities to Google Calendar with your explicit consent."
            />
            <Feature
              icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
              title="Role-based access"
              body="Owners, PMs, sales, clients, and trades see only what they need."
            />
          </ul>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 rounded-[12px] border border-sb-border bg-sb-surface/90 p-4 shadow-[var(--sb-shadow)]">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-sb-orange-soft text-sb-orange">
        {icon}
      </span>
      <div>
        <p className="font-semibold text-sb-ink">{title}</p>
        <p className="mt-1 text-sm text-sb-muted">{body}</p>
      </div>
    </li>
  );
}
