import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClientPortalBanner({
  projectName,
  statusLabel,
  projects,
  activeProjectId,
}: {
  projectName: string;
  statusLabel?: string;
  projects?: Array<{ id: string; name: string }>;
  activeProjectId?: string;
}) {
  const multi = (projects?.length ?? 0) > 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-sb-yellow-soft px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-sb-blue px-2 py-0.5 text-xs font-semibold text-white">
          Client Home owner
        </span>
        {multi && projects && activeProjectId ? (
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-sb-ink">
              <span className="truncate max-w-[200px] sm:max-w-xs">
                {projectName}
              </span>
              <ChevronDown size={14} aria-hidden />
            </summary>
            <div className="absolute left-0 z-20 mt-2 min-w-[220px] rounded-xl border border-sb-border bg-sb-surface p-2 shadow-lg">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`?projectId=${p.id}`}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm hover:bg-sb-canvas",
                    p.id === activeProjectId && "bg-sb-canvas font-semibold"
                  )}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </details>
        ) : (
          <span className="truncate text-sm font-medium text-sb-ink">
            {projectName}
          </span>
        )}
      </div>
      {statusLabel ? (
        <span className="text-sm text-sb-muted">{statusLabel}</span>
      ) : null}
    </div>
  );
}
