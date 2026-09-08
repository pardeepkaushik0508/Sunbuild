import Link from "next/link";
import { DocumentVisibility, Role } from "@prisma/client";
import { uploadDocumentAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMDocumentsPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { projectId: filterProjectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filteredIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const [documents, projects] = await Promise.all([
    prisma.document.findMany({
      where: { projectId: { in: filteredIds } },
      include: {
        project: { select: { name: true } },
        uploadedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Project files and drawings"
        actions={
          filterProjectId ? (
            <Link href="/pm/documents">
              <Button variant="outline" size="sm">
                All projects
              </Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Upload document
        </h2>
        <form
          action={uploadDocumentAction}
          encType="multipart/form-data"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project">
            <Select
              name="projectId"
              required
              defaultValue={filterProjectId ?? ""}
            >
              <option value="" disabled>
                Select project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Title">
            <Input name="title" />
          </FormField>
          <FormField label="Category">
            <Input name="category" defaultValue="GENERAL" />
          </FormField>
          <FormField label="Visibility">
            <Select name="visibility" defaultValue={DocumentVisibility.INTERNAL}>
              {Object.values(DocumentVisibility).map((v) => (
                <option key={v} value={v}>
                  {v.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="File">
            <Input name="file" type="file" required />
          </FormField>
          <FormField label="Notes" className="md:col-span-2">
            <Textarea name="notes" />
          </FormField>
          <div className="md:col-span-2">
            <Button type="submit">Upload</Button>
          </div>
        </form>
      </Card>

      {documents.length === 0 ? (
        <EmptyState title="No documents" />
      ) : (
        <DataTable
          headers={["Title", "Project", "Category", "Visibility", "Uploaded", "File"]}
        >
          {documents.map((doc) => (
            <tr key={doc.id}>
              <Td className="font-medium">{doc.title}</Td>
              <Td>{doc.project.name}</Td>
              <Td>{doc.category}</Td>
              <Td>
                <StatusBadge tone={statusTone(doc.visibility)}>
                  {doc.visibility.replace(/_/g, " ")}
                </StatusBadge>
              </Td>
              <Td>
                {doc.uploadedBy.name}
                <p className="text-xs text-sb-muted">{formatDate(doc.createdAt)}</p>
              </Td>
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
