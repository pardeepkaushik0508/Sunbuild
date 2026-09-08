"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCheck,
  ChevronDown,
  FolderKanban,
  Home,
  Leaf,
  LineChart,
  Star,
  Timer,
  Users,
  CircleDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CompanyAccent,
  CompanyOverviewStats,
} from "@/lib/dashboard/company-stats";

const STORAGE_KEY = "sb-org-management-collapsed";

const accentIcon: Record<
  CompanyAccent,
  { wrap: string; Icon: typeof Home }
> = {
  blue: { wrap: "bg-[#dbeafe] text-[#2563eb]", Icon: Home },
  green: { wrap: "bg-[#dcfce7] text-[#16a34a]", Icon: Leaf },
  purple: { wrap: "bg-[#ede9fe] text-[#7c3aed]", Icon: Star },
};

const metricDefs = [
  {
    key: "users" as const,
    label: "users",
    wrap: "bg-[#dbeafe] text-[#2563eb]",
    Icon: Users,
  },
  {
    key: "activeProjects" as const,
    label: "Active Projects",
    wrap: "bg-[#dcfce7] text-[#16a34a]",
    Icon: FolderKanban,
  },
  {
    key: "completed" as const,
    label: "Completed",
    wrap: "bg-[#ede9fe] text-[#7c3aed]",
    Icon: CheckCheck,
  },
  {
    key: "growth" as const,
    label: "Growth",
    wrap: "bg-[#ffedd5] text-[#ea580c]",
    Icon: LineChart,
  },
  {
    key: "deadlines" as const,
    label: "Deadlines",
    wrap: "bg-[#fee2e2] text-[#dc2626]",
    Icon: Timer,
  },
  {
    key: "revenue" as const,
    label: "Revenue",
    wrap: "bg-[#ede9fe] text-[#7c3aed]",
    Icon: CircleDollarSign,
  },
];

function metricValue(company: CompanyOverviewStats, key: (typeof metricDefs)[number]["key"]) {
  switch (key) {
    case "users":
      return String(company.users);
    case "activeProjects":
      return String(company.activeProjects);
    case "completed":
      return String(company.completed);
    case "growth":
      return `${company.growthPercent}%`;
    case "deadlines":
      return String(company.deadlines);
    case "revenue":
      return company.revenueLabel;
  }
}

export function OrganizationManagement({
  companies,
  className,
}: {
  companies: CompanyOverviewStats[];
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <section className={cn("w-full space-y-4", className)}>
      <div className="flex items-center justify-between gap-3 rounded-[16px] border border-sb-border bg-[#f3f4f6] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] text-white shadow-sm">
            <Building2 size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold tracking-tight text-sb-ink">
              Organization Management
            </h2>
            <p className="truncate text-[13px] text-sb-muted">
              Our profile system oversight and administration
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="organization-companies"
          aria-label={collapsed ? "Expand organization section" : "Collapse organization section"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-sb-border bg-white text-sb-muted transition hover:bg-sb-canvas"
        >
          <ChevronDown
            size={18}
            className={cn(
              "transition-transform duration-200",
              hydrated && !collapsed && "rotate-180"
            )}
            aria-hidden
          />
        </button>
      </div>

      {!collapsed ? (
        <div id="organization-companies" className="space-y-6">
          {companies.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-sb-border bg-sb-surface px-4 py-10 text-center text-sm text-sb-muted">
              No companies available yet.
            </div>
          ) : (
            companies.map((company) => {
              const visual = accentIcon[company.accent];
              const Icon = visual.Icon;
              return (
                <div key={company.id} className="space-y-3">
                  <Link
                    href={company.href}
                    className="group flex min-w-0 items-center gap-3"
                  >
                    <span
                      className={cn(
                        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                        visual.wrap
                      )}
                    >
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold text-sb-ink transition group-hover:text-sb-orange">
                        {company.name}
                      </p>
                      <p className="truncate text-[13px] text-sb-muted">
                        {company.description ||
                          company.brand ||
                          "Company workspace"}
                      </p>
                    </div>
                  </Link>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    {metricDefs.map((metric) => {
                      const MetricIcon = metric.Icon;
                      return (
                        <Link
                          key={metric.key}
                          href={company.href}
                          className="flex min-w-0 items-center gap-3 rounded-[14px] border border-sb-border bg-sb-surface px-3.5 py-3.5 shadow-[var(--sb-shadow)] transition hover:border-sb-orange/40"
                        >
                          <span
                            className={cn(
                              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                              metric.wrap
                            )}
                          >
                            <MetricIcon size={18} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[20px] leading-none font-bold tracking-tight text-sb-ink">
                              {metricValue(company, metric.key)}
                            </p>
                            <p className="mt-1 truncate text-[12px] text-sb-muted">
                              {metric.label}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}
