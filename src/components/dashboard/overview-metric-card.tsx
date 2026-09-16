import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Owner-style overview metric chip (icon + value + label). */
export function OverviewMetricCard({
  label,
  value,
  icon: Icon,
  wrap,
  href,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Tailwind classes for the icon circle, e.g. bg-[#dcfce7] text-[#16a34a] */
  wrap: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          wrap
        )}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="font-heading truncate text-[20px] leading-none font-bold tracking-tight text-sb-ink">
          {value}
        </p>
        <p className="mt-1 text-[12px] leading-tight text-sb-muted">{label}</p>
      </div>
    </>
  );

  const shell = cn(
    "flex min-w-0 items-center gap-3 rounded-[14px] border border-sb-border bg-sb-surface px-3.5 py-3.5 shadow-[var(--sb-shadow)] transition",
    href && "hover:border-sb-orange/40",
    className
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
