import Link from "next/link";
import { DocumentVisibility, Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
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
    take: 100,
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
        <DataTable headers={["Title", "Project", "Category", "Uploaded", "File"]}>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <Td className="font-medium">{doc.title}</Td>
              <Td>{doc.project.name}</Td>
              <Td>{doc.category}</Td>
              <Td>{formatDate(doc.createdAt)}</Td>
              <Td>
                <a
                  href={`/api/files/${doc.filePath}`}
                  className="text-sm underline hover:text-sb-yellow-dark"
                  target="_blank"
                  rel="noreferrer"
                >
                  {doc.fileName}
                </a>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
