"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const OWNER_TABS = [
  { label: "Overview", href: "/owner", match: (p: string) => p === "/owner" },
  {
    label: "Internal Alerts",
    href: "/owner/alerts",
    match: (p: string) => p.startsWith("/owner/alerts"),
  },
  {
    label: "KPI Management",
    href: "/owner/kpis",
    match: (p: string) => p.startsWith("/owner/kpis"),
  },
  {
    label: "Permissions",
    href: "/owner/permissions",
    match: (p: string) => p.startsWith("/owner/permissions"),
  },
  {
    label: "Settings",
    href: "/owner/settings",
    match: (p: string) => p.startsWith("/owner/settings"),
  },
] as const;

export function OwnerTabs({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Owner modules"
      className={cn(
        // overflow-y-hidden prevents the classic vertical scrollbar when
        // overflow-x-auto is set and the active underline sits on the border.
        "flex w-full gap-6 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-sb-border",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {OWNER_TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 pb-3 text-[14px] font-medium transition",
              active
                ? "text-[#8b5cf6]"
                : "text-[#6b7280] hover:text-sb-ink"
            )}
          >
            {tab.label}
            {active ? (
              <span
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#8b5cf6]"
                aria-hidden
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
