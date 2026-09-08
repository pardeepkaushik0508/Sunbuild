import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={cn("sb-card p-5", className)}>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  accent = "blue",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "blue" | "green" | "purple" | "orange" | "red" | "indigo";
  className?: string;
}) {
  const bar: Record<string, string> = {
    blue: "bg-sb-blue",
    green: "bg-emerald-500",
    purple: "bg-sb-purple",
    orange: "bg-sb-orange",
    red: "bg-sb-red",
    indigo: "bg-indigo-500",
  };
  return (
    <Card className={cn("min-w-0 overflow-hidden p-0", className)}>
      <div className={cn("h-1 w-full", bar[accent])} />
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-sb-muted">
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-sb-ink">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-sb-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-[16px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:px-6 sm:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#8b5cf6] text-white shadow-sm">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[18px] leading-tight font-bold tracking-tight text-[#111827] sm:text-[20px]">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-[13px] leading-snug text-[#6b7280]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}


export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-sb-border bg-white px-6 py-16 text-center">
      <p className="font-medium text-sb-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-sb-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-sb-muted">
      {label}
    </div>
  );
}

export function ProgressBar({
  value,
  color = "green",
}: {
  value: number;
  color?: "green" | "blue" | "purple" | "orange";
}) {
  const colors = {
    green: "bg-emerald-500",
    blue: "bg-sb-blue",
    purple: "bg-sb-purple",
    orange: "bg-sb-orange",
  };
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={cn("h-full rounded-full", colors[color])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
