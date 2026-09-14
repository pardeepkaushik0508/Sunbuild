import Link from "next/link";
import { DocumentVisibility, Role, ContractStatus } from "@prisma/client";
import { PageHeader, EmptyState, Card } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, formatCurrency, mediaUrl } from "@/lib/utils";
import { FileText, FileSpreadsheet, Download, Printer } from "lucide-react";

export default async function ClientDocumentsPage() {
  const session = await requireRole(Role.CLIENT);
  const projectIds = await getAccessibleProjectIds(session);

  const [documents, contracts] = await Promise.all([
    prisma.document.findMany({
      where: {
        projectId: { in: projectIds },
        visibility: DocumentVisibility.CLIENT_VISIBLE,
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.purchaseContract.findMany({
      where: {
        projectId: { in: projectIds },
        status: { in: [ContractStatus.SIGNED, ContractStatus.EXECUTED] },
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
      <PageHeader
        title="Documents & Agreements"
        description="Official purchase agreements, allowances, and shared project documents"
        actions={
          <Link href="/client">
            <Button variant="outline" size="sm">
              My home
            </Button>
          </Link>
        }
      />

      {/* Official Contracts & SOA Agreements for Homeowner */}
      {contracts.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-sb-muted">
            Executed Contracts & Allowances
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contracts.map((c) => (
              <Card key={c.id} className="border-l-4 border-l-emerald-500 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      <span className="font-bold text-sb-ink">
                        {c.contractNumber || "Purchase Agreement"}
                      </span>
                    </div>
                    <p className="text-xs text-sb-muted">
                      {c.project?.name} · Executed {formatDate(c.executedAt || c.createdAt)}
                    </p>
                    <p className="font-mono text-xs font-semibold text-sb-ink pt-1">
                      Total Contract Price: {formatCurrency(c.totalContractPrice ?? c.purchasePrice)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/sales/contracts/${c.id}/print`}
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

                {/* Linked SOA Schedule */}
                {c.scheduleOfAllowances ? (
                  <div className="mt-3 pt-3 border-t border-sb-border flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-sb-orange" />
                      <span className="text-sb-muted">Schedule of Allowances:</span>
                      <span className="font-semibold text-sb-ink">
                        {formatCurrency(c.scheduleOfAllowances.totalAllowance)}
                      </span>
                    </div>
                    <a
                      href={`/sales/soa/${c.scheduleOfAllowances.id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      View SOA Schedule →
                    </a>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* Shared Files Table */}
      {documents.length === 0 && contracts.length === 0 ? (
        <EmptyState title="No documents shared yet" />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-sb-muted">
            Shared Project Files
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
