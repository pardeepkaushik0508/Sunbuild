import Link from "next/link";
import {
  CalendarDays,
  CircleDollarSign,
  FileBarChart,
  Plus,
} from "lucide-react";

export function JobActions({
  createJobHref,
  scheduleHref,
  reportsHref,
  budgetOverviewHref,
  canCreateJob,
  canViewBudget,
  canManageSchedule,
}: {
  createJobHref: string;
  scheduleHref: string;
  reportsHref: string;
  budgetOverviewHref: string;
  canCreateJob: boolean;
  canViewBudget: boolean;
  canManageSchedule: boolean;
}) {
  const actions = [
    canCreateJob
      ? {
          id: "new",
          label: "New Project",
          href: createJobHref,
          Icon: Plus,
        }
      : null,
    canManageSchedule
      ? {
          id: "schedule",
          label: "Schedule View",
          href: scheduleHref,
          Icon: CalendarDays,
        }
      : null,
    {
      id: "reports",
      label: "Reports",
      href: reportsHref,
      Icon: FileBarChart,
    },
    canViewBudget
      ? {
          id: "budget",
          label: "Budget Overview",
          href: budgetOverviewHref,
          Icon: CircleDollarSign,
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    label: string;
    href: string;
    Icon: typeof Plus;
  }>;

  return (
    <section className="space-y-3">
      <h2 className="text-[16px] font-bold text-sb-ink">Job Actions</h2>
      <div className="flex flex-col gap-2">
        {actions.map(({ id, label, href, Icon }) => (
          <Link
            key={id}
            href={href}
            className="flex items-center gap-3 rounded-[10px] border border-sb-border bg-sb-surface px-4 py-3.5 text-[14px] font-medium text-sb-ink shadow-[var(--sb-shadow)] transition hover:border-sb-orange/40 hover:bg-sb-canvas"
          >
            <Icon size={18} className="shrink-0 text-sb-body" />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
