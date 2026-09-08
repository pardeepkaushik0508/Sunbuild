"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";

export type OrganizationDetail = {
  label: string;
  value: string;
};

export function OrganizationHeader({
  companyName,
  brand,
  slug,
  isActive = true,
  details = [],
  settingsHref = "/owner/settings",
  usersHref,
  className,
}: {
  companyName: string;
  brand?: string | null;
  slug?: string | null;
  isActive?: boolean;
  details?: OrganizationDetail[];
  settingsHref?: string;
  usersHref?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const rows: OrganizationDetail[] = [
    { label: "Company", value: companyName },
    ...(brand ? [{ label: "Brand", value: brand }] : []),
    ...(slug ? [{ label: "Slug", value: slug }] : []),
    { label: "Status", value: isActive ? "Active" : "Inactive" },
    ...details,
  ];

  return (
    <section
      className={cn(
        "w-full overflow-hidden rounded-[14px] border border-[#fde68a]/70 bg-[#fff8e1]",
        className
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
        aria-expanded={open}
        aria-controls="organization-details"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#8b5cf6] text-white shadow-sm">
            <Building2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-sb-ink">
              Organization Management
            </p>
            <p className="truncate text-[12px] text-sb-muted">
              {brand ? `${brand} · ` : ""}
              {companyName}
            </p>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-sb-muted transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id="organization-details"
          className="w-full border-t border-[#fde68a]/70 bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold text-sb-ink">
                {companyName}
              </h3>
              <StatusBadge tone={isActive ? "success" : "danger"}>
                {isActive ? "Active" : "Inactive"}
              </StatusBadge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              {usersHref ? (
                <Link
                  href={usersHref}
                  className="font-medium text-sb-ink transition hover:text-[#f97316]"
                >
                  Users
                </Link>
              ) : null}
              <Link
                href={settingsHref}
                className="font-medium text-sb-ink transition hover:text-[#f97316]"
              >
                {settingsHref.includes("settings") ? "Settings →" : "View details →"}
              </Link>
            </div>
          </div>

          <dl className="grid w-full grid-cols-2 border-t border-[#e5e7eb] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {rows.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className={cn(
                  "min-w-0 px-4 py-3.5 sm:px-5",
                  i > 0 && "border-t border-[#e5e7eb] sm:border-t-0 sm:border-l"
                )}
              >
                <dt className="text-[11px] font-medium tracking-[0.06em] text-[#9ca3af] uppercase">
                  {row.label}
                </dt>
                <dd className="mt-1 truncate text-[14px] font-semibold text-sb-ink">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
