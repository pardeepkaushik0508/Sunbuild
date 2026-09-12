import Link from "next/link";
import { DocumentVisibility, Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function ClientDocumentsPage() {
  const session = await requireRole(Role.CLIENT);
  const projectIds = await getAccessibleProjectIds(session);

  const documents = await prisma.document.findMany({
    where: {
      projectId: { in: projectIds },
      visibility: DocumentVisibility.CLIENT_VISIBLE,
    },
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Shared project documents"
        actions={
          <Link href="/client">
            <Button variant="outline" size="sm">
              My home
            </Button>
          </Link>
        }
      />

      {documents.length === 0 ? (
        <EmptyState title="No documents shared yet" />
      ) : (
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
                  href={`/api/files/${doc.filePath}`}
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
      )}
    </div>
  );
}
