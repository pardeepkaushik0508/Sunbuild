import Link from "next/link";
import { Bell } from "lucide-react";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/session";
import { getNotificationFeed } from "@/lib/notifications-feed";
import { markAllNotificationsReadAction } from "@/lib/notifications-actions";
import { cn, formatDate } from "@/lib/utils";
import { MarkNotificationLink } from "@/components/notifications/mark-notification-link";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; category?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const filter = sp.filter === "unread" ? "unread" : "all";
  const category = ["PROJECT", "FINANCE", "WARRANTY", "TASKS"].includes(
    sp.category ?? ""
  )
    ? sp.category
    : null;
  const { items, unreadCount } = await getNotificationFeed(session, {
    limit: 100,
    unreadOnly: filter === "unread",
    category,
  });

  const filters = [
    { id: "all", label: "All", href: "/notifications" },
    { id: "unread", label: "Unread", href: "/notifications?filter=unread" },
    { id: "PROJECT", label: "Project", href: "/notifications?category=PROJECT" },
    { id: "FINANCE", label: "Finance", href: "/notifications?category=FINANCE" },
    { id: "WARRANTY", label: "Warranty", href: "/notifications?category=WARRANTY" },
    { id: "TASKS", label: "Tasks / Schedule", href: "/notifications?category=TASKS" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="All alerts and updates for your account"
        icon={<Bell size={18} />}
        actions={
          unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <Button type="submit" variant="outline" size="sm">
                Mark all as read
              </Button>
            </form>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active =
            (f.id === "all" && filter === "all" && !category) ||
            (f.id === "unread" && filter === "unread") ||
            (category && f.id === category);
          return (
            <Link
              key={f.id}
              href={f.href}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                active
                  ? "border-sb-blue bg-sb-blue-soft text-sb-blue"
                  : "border-sb-border text-sb-muted hover:text-sb-ink"
              )}
            >
              {f.label}
              {f.id === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="New notifications will show up here when something needs your attention."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-sb-border">
            {items.map((item) => {
              const isUnread = item.persisted && item.read === false;
              return (
                <li key={item.id}>
                  <MarkNotificationLink
                    href={item.href}
                    notificationId={item.persisted ? item.id : null}
                    className={cn(
                      "flex gap-4 px-5 py-4 transition hover:bg-sb-canvas",
                      isUnread && "bg-sb-canvas/60"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                        isUnread ? "bg-sb-orange" : "bg-transparent"
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm text-sb-ink",
                            isUnread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {item.title}
                        </p>
                        {item.tone ? (
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              item.tone === "danger" && "text-sb-red",
                              item.tone === "warning" && "text-sb-orange",
                              item.tone === "info" && "text-sb-blue"
                            )}
                          >
                            {item.tone}
                          </span>
                        ) : null}
                      </div>
                      {item.body ? (
                        <p className="mt-0.5 text-sm text-sb-muted">{item.body}</p>
                      ) : null}
                      {item.createdAt ? (
                        <p className="mt-1 text-xs text-sb-muted">
                          {formatDate(new Date(item.createdAt))}
                        </p>
                      ) : null}
                    </div>
                  </MarkNotificationLink>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="text-center text-xs text-sb-muted">
        Showing {items.length} notification{items.length === 1 ? "" : "s"}
        {unreadCount > 0 ? ` · ${unreadCount} unread` : null}
        {" · "}
        <Link href="/" className="text-sb-blue hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
