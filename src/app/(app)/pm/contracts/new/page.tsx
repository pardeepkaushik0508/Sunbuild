import Link from "next/link";
import { Role } from "@prisma/client";
import { uploadContractAction } from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMContractNewPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
  ]);
  const { projectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const defaultProjectId =
    projectId && projectIds.includes(projectId) ? projectId : "";

  return (
    <div>
      <PageHeader
        title="Upload contract"
        description="Upload a purchase agreement PDF and enter key fields"
        actions={
          <Link href="/pm/contracts">
            <Button variant="outline" size="sm">
              All contracts
            </Button>
          </Link>
        }
      />

      <Card>
        <ActionForm
          action={uploadContractAction}
          encType="multipart/form-data"
          className="grid gap-4 md:grid-cols-2"
        >
          <FormField label="PDF file" className="md:col-span-2">
            <Input name="file" type="file" accept=".pdf,application/pdf" required />
          </FormField>
          <FormField label="Link to project (optional)">
            <select
              name="projectId"
              defaultValue={defaultProjectId}
              className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm"
            >
              <option value="">No project yet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Project name">
            <Input name="projectName" />
          </FormField>
          <FormField label="Contract number">
            <Input name="contractNumber" />
          </FormField>
          <FormField label="Municipal address">
            <Input name="municipalAddress" />
          </FormField>
          <FormField label="Legal address">
            <Input name="legalAddress" />
          </FormField>
          <FormField label="Lot / block / plan">
            <Input name="lotBlockPlan" />
          </FormField>
          <FormField label="Purchase price (CAD)">
            <Input name="purchasePrice" type="number" step="0.01" />
          </FormField>
          <FormField label="Contract date">
            <Input name="contractDate" type="date" />
          </FormField>
          <FormField label="Target closing">
            <Input name="targetClosing" type="date" />
          </FormField>
          <FormField label="Buyer first name">
            <Input name="buyerFirstName" />
          </FormField>
          <FormField label="Buyer last name">
            <Input name="buyerLastName" />
          </FormField>
          <FormField label="Buyer email">
            <Input name="buyerEmail" type="email" />
          </FormField>
          <FormField label="Buyer phone">
            <Input name="buyerPhone" type="tel" />
          </FormField>
          <FormField label="Buyer mailing address" className="md:col-span-2">
            <Input name="buyerMailing" />
          </FormField>
          <FormField label="Builder name">
            <Input name="builderName" defaultValue="Sunview Custom Homes" />
          </FormField>
          <FormField label="Review notes" className="md:col-span-2">
            <Textarea name="reviewNotes" />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Uploading…">Upload & review</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
