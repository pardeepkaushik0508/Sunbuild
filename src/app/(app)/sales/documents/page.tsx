import Link from "next/link";
import { DocumentVisibility, Role } from "@prisma/client";
import { uploadDocumentAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function SalesDocumentsPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);
  const { projectId: filterProjectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { companyId: session.membership.companyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const projectIds = projects.map((p) => p.id);
  const filteredIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const documents = await prisma.document.findMany({
    where: { projectId: { in: filteredIds } },
    include: {
      project: { select: { name: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Upload specifications, proposals, and project documents"
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Upload document
        </h2>
        <ActionForm
          action={uploadDocumentAction}
          successMessage="Document uploaded successfully"
          encType="multipart/form-data"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project">
            <Select
              name="projectId"
              required
              defaultValue={filterProjectId ?? (projects[0]?.id || "")}
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
            <Input name="title" placeholder="Document title" required />
          </FormField>
          <FormField label="Category">
            <Input name="category" defaultValue="GENERAL" placeholder="e.g. SPECIFICATIONS, CONTRACT, PLAN" />
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
          <FormField label="File" className="md:col-span-2">
            <Input name="file" type="file" required />
          </FormField>
          <FormField label="Notes" className="md:col-span-2">
            <Textarea name="notes" placeholder="Additional notes or specifications..." />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Uploading…">Upload document</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents uploaded"
          description="Use the upload form above to add specifications and project documents."
        />
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
