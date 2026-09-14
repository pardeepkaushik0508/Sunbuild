import type { ReactNode } from "react";

/**
 * Shared chrome for the Overview 3-column widget row
 * (Recent Jobs · To Do · Calendar). Keep identical across all roles.
 */
export const DASHBOARD_WIDGET_SHELL =
  "flex h-full min-h-[360px] max-h-[480px] flex-col overflow-hidden rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)] xl:h-[460px]";

/** Canonical 3-column overview widget grid used on every role dashboard. */
export function DashboardWidgetRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

/** Wrap the calendar column so breakpoints match Owner/PM/Sales. */
export function DashboardCalendarSlot({ children }: { children: ReactNode }) {
  return <div className="h-full lg:col-span-2 xl:col-span-1">{children}</div>;
}
