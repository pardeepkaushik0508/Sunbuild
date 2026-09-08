import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState, Card } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatRelativeTime, fullName } from "@/lib/utils";

export default async function SalesActivitiesPage() {
  const session = await requireRole([Role.SALES_MANAGER, Role.OWNER]);
  const companyId = session.membership.companyId;

  const activities = await prisma.leadActivity.findMany({
    where: {
      lead: {
        companyId,
        ...(session.membership.role === Role.SALES_MANAGER
          ? {
              OR: [
                { assigneeId: session.user.id },
                { assigneeId: null },
              ],
            }
          : {}),
      },
    },
    orderBy: [{ activityDate: "desc" }, { createdAt: "desc" }],
    take: 80,
    include: {
      lead: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activities"
        description="All sales notes, calls, meetings, and follow-ups"
        actions={
          <Link
            href="/sales"
            className="text-sm font-medium text-sb-orange hover:underline"
          >
            Back to overview
          </Link>
        }
      />

      {activities.length === 0 ? (
        <EmptyState
          title="No activities yet"
          description="Activity is logged when you create leads, update status, add notes, or schedule follow-ups."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-sb-border">
            {activities.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/sales/leads/${a.lead.id}`}
                  className="flex flex-col gap-1 px-5 py-4 hover:bg-sb-canvas/60 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sb-ink">
                      {a.title?.trim() ||
                        `${a.type.replace(/_/g, " ")} · ${fullName(a.lead.firstName, a.lead.lastName)}`}
                    </p>
                    <p className="mt-1 text-sm text-sb-muted">{a.content}</p>
                    <p className="mt-1 text-xs text-sb-muted">
                      {a.user.name}
                      {a.dueAt
                        ? ` · Due ${formatRelativeTime(a.dueAt)}`
                        : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-sb-muted">
                    {formatRelativeTime(a.activityDate ?? a.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
