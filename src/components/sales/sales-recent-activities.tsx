import Link from "next/link";
import {
  CalendarDays,
  FileText,
  MessageSquare,
  Phone,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SalesActivityItem } from "@/lib/dashboard/load-sales-overview";

function iconForType(type: string) {
  switch (type) {
    case "CALL":
      return { Icon: Phone, wrap: "bg-[#eff6ff] text-[#3b82f6]" };
    case "PROPOSAL":
    case "EMAIL":
      return { Icon: FileText, wrap: "bg-[#ecfdf5] text-[#10b981]" };
    case "MEETING":
    case "SITE_VISIT":
      return { Icon: CalendarDays, wrap: "bg-[#f5f3ff] text-[#8b5cf6]" };
    case "STATUS":
      return { Icon: UserRound, wrap: "bg-[#fffbeb] text-[#d97706]" };
    default:
      return { Icon: MessageSquare, wrap: "bg-[#f3f4f6] text-[#4b5563]" };
  }
}

export function SalesRecentActivities({
  items,
  error,
}: {
  items: SalesActivityItem[];
  error?: string | null;
}) {
  return (
    <section className="flex h-full min-h-[360px] flex-col rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-[var(--sb-shadow)]">
      <div className="mb-4">
        <h3 className="text-[16px] font-semibold text-sb-ink">
          Recent Activities
        </h3>
        <p className="text-[12px] text-sb-muted">
          Latest sales follow-ups and updates
        </p>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-sb-muted">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-sb-muted">
          No recent activities yet.
        </p>
      ) : (
        <ul className="flex-1 space-y-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const { Icon, wrap } = iconForType(item.type);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex gap-3 rounded-[14px] border border-sb-border bg-white p-3.5 transition hover:border-[#f97316]/35 hover:shadow-sm"
                >
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      wrap
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[14px] font-semibold text-sb-ink">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-sb-muted">
                        {item.relativeTime}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-sb-muted">
                      {item.description}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
