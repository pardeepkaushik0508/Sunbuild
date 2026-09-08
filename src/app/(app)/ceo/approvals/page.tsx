import Link from "next/link";
import { CompletionDocStatus, Role } from "@prisma/client";
import { ceoCompletionDecisionAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, fullName } from "@/lib/utils";

export default async function CeoApprovalsPage() {
  const session = await requireRole([Role.CEO, Role.OWNER]);
  const companyId = session.membership.companyId;

  const companyProjects = await prisma.project.findMany({
    where: { companyId },
    select: { id: true },
  });
  const projectIds = companyProjects.map((p) => p.id);

  const pendingDocs = await prisma.completionDocument.findMany({
    where: {
      status: CompletionDocStatus.PENDING_CEO_APPROVAL,
      projectId: { in: projectIds },
    },
    orderBy: { createdAt: "asc" },
  });

  const projects = await prisma.project.findMany({
    where: { id: { in: pendingDocs.map((d) => d.projectId) } },
    include: {
      buyer: true,
      pm: { select: { name: true } },
    },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader
        title="Completion approvals"
        description="Review substantial completion packages before handover"
      />

      {pendingDocs.length === 0 ? (
        <EmptyState
          title="No pending approvals"
          description="Completion documents awaiting CEO sign-off will appear here."
        />
      ) : (
        <div className="space-y-4">
          {pendingDocs.map((doc) => {
            const project = projectById.get(doc.projectId);
            if (!project) return null;

            return (
              <Card key={doc.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
                        {project.name}
                      </h2>
                      <StatusBadge tone={statusTone(doc.status)}>
                        {doc.status.replace(/_/g, " ")}
                      </StatusBadge>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-sb-muted">Buyer</dt>
                        <dd>
                          {project.buyer
                            ? fullName(
                                project.buyer.firstName,
                                project.buyer.lastName
                              )
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sb-muted">Project manager</dt>
                        <dd>{project.pm?.name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-sb-muted">Submitted</dt>
                        <dd>{formatDate(doc.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-sb-muted">Document</dt>
                        <dd>
                          {doc.fileName ? (
                            <a
                              href={`/api/files/${doc.filePath}`}
                              className="text-sb-black underline hover:text-sb-yellow-dark"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {doc.fileName}
                            </a>
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      href={`/pm/projects/${doc.projectId}`}
                      className="mt-2 inline-block text-sm text-sb-muted hover:text-sb-black"
                    >
                      View project →
                    </Link>
                  </div>

                  <div className="w-full shrink-0 lg:max-w-sm">
                    <form
                      action={ceoCompletionDecisionAction.bind(
                        null,
                        doc.projectId,
                        "APPROVED"
                      )}
                      className="space-y-3"
                    >
                      <FormField label="Comments (optional)">
                        <Textarea name="comments" placeholder="Approval notes..." />
                      </FormField>
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Approve handover</Button>
                      </div>
                    </form>
                    <form
                      action={ceoCompletionDecisionAction.bind(
                        null,
                        doc.projectId,
                        "REJECTED"
                      )}
                      className="mt-3 space-y-3 border-t border-sb-border pt-3"
                    >
                      <FormField label="Rejection reason">
                        <Textarea
                          name="comments"
                          required
                          placeholder="What needs to be corrected?"
                        />
                      </FormField>
                      <Button type="submit" variant="danger">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
