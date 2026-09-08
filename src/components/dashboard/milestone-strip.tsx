import Link from "next/link";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { resolveScheduleDisplayStatus } from "@/lib/schedule/display-status";
import { formatDate } from "@/lib/utils";

export function MilestoneStrip({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    projectName: string;
    status: string;
    dueDate?: Date | string | null;
    href?: string;
  }>;
}) {
  return (
    <section className="rounded-[16px] border border-[#e5e7eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.06)]">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#e5e7eb]">
          Day
        </span>
        <span className="rounded-lg bg-[#1f2937] px-3 py-1.5 text-xs font-semibold text-white">
          Week
        </span>
        <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-[#e5e7eb]">
          Month
        </span>
        <span className="ml-auto text-sm text-[#6b7280]">Schedule overview</span>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-[#6b7280]">No milestones yet.</p>
        ) : (
          items.map((item) => {
            const display = resolveScheduleDisplayStatus(
              item.status,
              item.dueDate
            );
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#e5e7eb] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#111827]">
                    {item.href ? (
                      <Link href={item.href} className="hover:text-[#f97316]">
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  <p className="truncate text-xs text-[#6b7280]">
                    {item.projectName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={statusTone(display)}>
                    {display.replace(/_/g, " ")}
                  </StatusBadge>
                  <span className="text-xs text-[#6b7280]">
                    {formatDate(item.dueDate)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
