import Link from "next/link";
import { DocumentVisibility, Role, ContractStatus } from "@prisma/client";
import { PageHeader, EmptyState, Card } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatCurrency, mediaUrl } from "@/lib/utils";
import { FileText, FileSpreadsheet, Download, Printer } from "lucide-react";
import { resolveClientProject } from "@/lib/client/project";
import { clientContractStatusLabel } from "@/lib/client/flow";

export default async function ClientDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await requireRole(Role.CLIENT);
  const sp = await searchParams;
  const project = await resolveClientProject(session, sp.projectId);
  const allIds = await getAccessibleProjectIds(session);

  if (!project) {
    return (
      <EmptyState
        title="No project assigned"
        description="Documents will appear once your home is linked."
      />
    );
  }

  const projects =
    allIds.length > 1
      ? await prisma.project.findMany({
          where: { id: { in: allIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [{ id: project.id, name: project.name }];

  const [documents, contracts] = await Promise.all([
    prisma.document.findMany({
      where: {
        projectId: project.id,
        visibility: DocumentVisibility.CLIENT_VISIBLE,
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.purchaseContract.findMany({
      where: {
        projectId: project.id,
        status: {
          in: [
            ContractStatus.SIGNED,
            ContractStatus.EXECUTED,
            ContractStatus.IN_REVIEW,
          ],
        },
      },
      include: {
        project: { select: { name: true } },
        scheduleOfAllowances: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <ClientPortalBanner
        projectName={project.name}
        statusLabel={project.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={project.id}
      />
      <PageHeader
        title="Documents & Agreements"
        description="Purchase agreement, allowances, and files shared with your household"
      />

      {contracts.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-sb-muted">
            Purchase agreement
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {contracts.map((c) => {
              const underReview = c.status === ContractStatus.IN_REVIEW;
              return (
                <Card
                  key={c.id}
                  className="border-l-4 border-l-emerald-500 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-600" />
                        <span className="font-bold text-sb-ink">
                          {c.contractNumber || "Purchase Agreement"}
                        </span>
                      </div>
                      <p className="text-xs text-sb-muted">
                        {c.project?.name} ·{" "}
                        {clientContractStatusLabel(c.status) ??
                          formatDate(c.executedAt || c.createdAt)}
                      </p>
                      {underReview ? (
                        <p className="pt-1 text-xs font-medium text-amber-800">
                          Extracted but not confirmed. Activation is blocked
                          until validation errors are corrected.
                        </p>
                      ) : (
                        <p className="pt-1 font-mono text-xs font-semibold text-sb-ink">
                          Total purchase price:{" "}
                          {formatCurrency(
                            c.totalContractPrice ?? c.purchasePrice
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/client/contracts/${c.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                          <Printer className="mr-1 h-3.5 w-3.5 text-sb-muted" />
                          Print
                        </Button>
                      </a>
                      <a
                        href={`/api/contracts/${c.id}/pdf`}
                        download={`${c.contractNumber || "contract"}.pdf`}
                      >
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                          <Download className="mr-1 h-3.5 w-3.5 text-sb-muted" />
                          PDF
                        </Button>
                      </a>
                    </div>
                  </div>

                  {c.scheduleOfAllowances && !underReview ? (
                    <div className="mt-3 flex items-center justify-between border-t border-sb-border pt-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-sb-orange" />
                        <span className="text-sb-muted">
                          Schedule of Allowances:
                        </span>
                        <span className="font-semibold text-sb-ink">
                          {formatCurrency(c.scheduleOfAllowances.totalAllowance)}
                        </span>
                      </div>
                      <Link
                        href={`/client/soa/${c.scheduleOfAllowances.id}/print`}
                        target="_blank"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        View schedule →
                      </Link>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {documents.length === 0 && contracts.length === 0 ? (
        <EmptyState title="No documents shared yet" />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-sb-muted">
            Shared project files
          </h2>
          <InteractiveDataTable
            searchPlaceholder="Search documents…"
            emptyMessage="No documents match your search"
            columns={[
              { key: "title", label: "Title" },
              { key: "project", label: "Project" },
              { key: "category", label: "Category" },
              { key: "uploaded", label: "Uploaded" },
              { key: "file", label: "File", sortable: false },
            ]}
            rows={documents.map((doc) => ({
              id: doc.id,
              searchText: [doc.title, doc.project.name, doc.category, doc.fileName]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                title: doc.title,
                project: doc.project.name,
                category: doc.category,
                uploaded: doc.createdAt.getTime(),
              },
              cells: [
                <Td key="title" className="font-medium">
                  {doc.title}
                </Td>,
                <Td key="project">{doc.project.name}</Td>,
                <Td key="category">{doc.category}</Td>,
                <Td key="uploaded">{formatDate(doc.createdAt)}</Td>,
                <Td key="file">
                  <a
                    href={mediaUrl(doc.filePath) ?? "#"}
                    className="text-sm underline hover:text-sb-yellow-dark"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.fileName}
                  </a>
                </Td>,
              ],
            }))}
          />
        </div>
      )}
    </div>
  );
}
