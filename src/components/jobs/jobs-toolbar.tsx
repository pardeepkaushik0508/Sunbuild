"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import type { JobsCompanyOption } from "@/lib/jobs/load-jobs";
import type { JobsSortKey, JobsStatusFilter } from "@/lib/jobs/constants";
import { pushWithProgress } from "@/lib/navigate";

export function JobsToolbar({
  companies,
  selectedCompanyId,
  createJobHref,
  canCreateJob,
  search,
  statusFilter,
  sort,
  pmFilter,
  clientFilter,
  pmOptions,
  clientOptions,
}: {
  companies: JobsCompanyOption[];
  selectedCompanyId: string;
  createJobHref: string;
  canCreateJob: boolean;
  search: string;
  statusFilter: JobsStatusFilter;
  sort: JobsSortKey;
  pmFilter: string;
  clientFilter: string;
  pmOptions: Array<{ id: string; name: string }>;
  clientOptions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(search);

  useEffect(() => {
    setQ(search);
  }, [search]);

  const pushParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (!("page" in patch)) params.delete("page");
      const qs = params.toString();
      startTransition(() => {
        pushWithProgress(router, qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === (search ?? "").trim()) return;
    const handle = window.setTimeout(() => {
      pushParams({ q: trimmed || null });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [q, search, pushParams]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[18px] font-bold tracking-tight text-sb-ink">
          Jobs Management & Setup
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative inline-flex min-w-[160px] items-center">
            <span className="sr-only">Company</span>
            <select
              className="h-10 w-full appearance-none rounded-[8px] border border-sb-border bg-white py-2 pr-9 pl-3 text-[13px] font-medium text-sb-ink"
              value={selectedCompanyId}
              disabled={pending || companies.length <= 1}
              onChange={(e) => pushParams({ companyId: e.target.value })}
              aria-label="Select company"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 text-sb-muted"
            />
          </label>
          {canCreateJob ? (
            <Link
              href={createJobHref}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-sb-blue px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-sb-blue/90"
            >
              <Plus size={16} />
              Create New Job
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sb-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs, client, PM, address…"
            className="h-10 w-full rounded-[8px] border border-sb-border bg-white py-2 pr-3 pl-9 text-[13px] text-sb-ink placeholder:text-sb-muted"
            aria-label="Search jobs"
          />
        </div>

        <select
          className="h-10 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] text-sb-ink"
          value={statusFilter}
          onChange={(e) => pushParams({ status: e.target.value })}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">In Progress / Active</option>
          <option value="planning">Planning</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>

        <select
          className="h-10 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] text-sb-ink"
          value={pmFilter}
          onChange={(e) => pushParams({ pmId: e.target.value || null })}
          aria-label="Filter by project manager"
        >
          <option value="">All PMs</option>
          {pmOptions.map((pm) => (
            <option key={pm.id} value={pm.id}>
              {pm.name}
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] text-sb-ink"
          value={clientFilter}
          onChange={(e) => pushParams({ clientId: e.target.value || null })}
          aria-label="Filter by client"
        >
          <option value="">All clients</option>
          {clientOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-[8px] border border-sb-border bg-white px-3 text-[13px] text-sb-ink"
          value={sort}
          onChange={(e) => pushParams({ sort: e.target.value })}
          aria-label="Sort jobs"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Project name</option>
          <option value="deadline">Deadline</option>
          <option value="progress">Progress</option>
          <option value="budget">Budget utilization</option>
        </select>
      </div>
    </div>
  );
}
