import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, SelectionSectionStatus } from "@prisma/client";
import { reviewSelectionSectionAction } from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PMSelectionDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);

  const pkg = await prisma.selectionPackage.findFirst({
    where: { id, projectId: { in: projectIds } },
    include: {
      project: { select: { name: true } },
      sections: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          approvals: {
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!pkg) notFound();

  return (
    <div>
      <PageHeader
        title={pkg.title}
        description={`${pkg.project.name} · ${pkg.sections.length} sections`}
        actions={
          <Link href="/pm/selections">
            <Button variant="outline" size="sm">
              All packages
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <StatusBadge tone={statusTone(pkg.status)}>
          {pkg.status.replace(/_/g, " ")}
        </StatusBadge>
        {pkg.submittedAt ? (
          <span className="ml-2 text-sm text-sb-muted">
            Submitted {formatDate(pkg.submittedAt)}
          </span>
        ) : null}
      </div>

      <div className="space-y-6">
        {pkg.sections.map((section) => (
          <Card key={section.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
                  {section.name}
                </h2>
                {section.notes ? (
                  <p className="mt-1 text-sm text-sb-muted">{section.notes}</p>
                ) : null}
              </div>
              <StatusBadge tone={statusTone(section.status)}>
                {section.status.replace(/_/g, " ")}
              </StatusBadge>
            </div>

            <div className="mt-4 space-y-3">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[10px] border border-sb-border bg-sb-canvas/40 px-4 py-3 text-sm"
                >
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1">{item.optionValue ?? "—"}</p>
                  {item.notes ? (
                    <p className="mt-1 text-sb-muted">{item.notes}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-sb-muted">
                    {item.selectedCost != null ? (
                      <span>Cost: {formatCurrency(item.selectedCost)}</span>
                    ) : null}
                    {item.allowanceAmount != null ? (
                      <span>Allowance: {formatCurrency(item.allowanceAmount)}</span>
                    ) : null}
                    {item.overage != null && item.overage > 0 ? (
                      <span className="text-sb-warning">
                        Overage: {formatCurrency(item.overage)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {section.approvals.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-sb-border pt-4">
                {section.approvals.map((a) => (
                  <li key={a.id} className="text-xs text-sb-muted">
                    {a.user.name} · {a.action} · {formatDate(a.createdAt)}
                    {a.comment ? ` — ${a.comment}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}

            {section.status === SelectionSectionStatus.SUBMITTED ? (
              <div className="mt-4 flex flex-col gap-4 border-t border-sb-border pt-4 sm:flex-row">
                <form
                  action={reviewSelectionSectionAction.bind(
                    null,
                    section.id,
                    "APPROVE"
                  )}
                  className="flex-1"
                >
                  <Button type="submit" className="w-full sm:w-auto">
                    Approve section
                  </Button>
                </form>
                <form
                  action={reviewSelectionSectionAction.bind(
                    null,
                    section.id,
                    "REQUEST_CHANGES"
                  )}
                  className="flex-1 space-y-2"
                >
                  <FormField label="Request changes comment">
                    <Textarea name="comment" placeholder="What needs to change?" />
                  </FormField>
                  <Button type="submit" variant="outline">
                    Request changes
                  </Button>
                </form>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
