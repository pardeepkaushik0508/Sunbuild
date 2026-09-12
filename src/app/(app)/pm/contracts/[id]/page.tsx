import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractStatus, Role } from "@prisma/client";
import {
  updateContractReviewAction,
  confirmContractAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

function dateInputValue(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function PMContractDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
  ]);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);

  const contract = await prisma.purchaseContract.findUnique({
    where: { id },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!contract) notFound();

  // Object-level ACL: linked project must be accessible; unlinked contracts
  // only for uploader or same-company staff (never cross-tenant by ID).
  if (contract.projectId) {
    if (!projectIds.includes(contract.projectId)) notFound();
  } else if (contract.uploadedById !== session.user.id) {
    const uploaderInCompany = await prisma.membership.findFirst({
      where: {
        userId: contract.uploadedById,
        companyId: session.membership.companyId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!uploaderInCompany) notFound();
  }

  const pms = await prisma.membership.findMany({
    where: {
      companyId: session.membership.companyId,
      role: Role.PROJECT_MANAGER,
      isActive: true,
    },
    include: { user: { select: { id: true, name: true } } },
  });

  const confirmed = contract.status === ContractStatus.CONFIRMED;
  const defaultPmId =
    session.membership.role === Role.PROJECT_MANAGER
      ? session.user.id
      : pms[0]?.user.id ?? "";

  const saveReview = updateContractReviewAction.bind(null, contract.id);
  const confirmContract = confirmContractAction.bind(null, contract.id);

  return (
    <div>
      <PageHeader
        title={contract.contractNumber ?? "Contract review"}
        description={contract.projectName ?? contract.fileName}
        actions={
          <>
            <Link href="/pm/contracts">
              <Button variant="outline" size="sm">
                All contracts
              </Button>
            </Link>
            <a
              href={`/api/files/${contract.filePath}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm">
                View PDF
              </Button>
            </a>
          </>
        }
      />

      <div className="mb-4">
        <StatusBadge tone={statusTone(contract.status)}>
          {contract.status.replace(/_/g, " ")}
        </StatusBadge>
        {contract.confirmedAt ? (
          <span className="ml-2 text-sm text-sb-muted">
            Confirmed {formatDate(contract.confirmedAt)}
          </span>
        ) : null}
      </div>

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Review fields
        </h2>
        <ActionForm
          action={saveReview}
          successMessage="Contract review saved"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project name">
            <Input name="projectName" defaultValue={contract.projectName ?? ""} />
          </FormField>
          <FormField label="Contract number">
            <Input
              name="contractNumber"
              defaultValue={contract.contractNumber ?? ""}
            />
          </FormField>
          <FormField label="Municipal address">
            <Input
              name="municipalAddress"
              defaultValue={contract.municipalAddress ?? ""}
            />
          </FormField>
          <FormField label="Legal address">
            <Input name="legalAddress" defaultValue={contract.legalAddress ?? ""} />
          </FormField>
          <FormField label="Lot / block / plan">
            <Input name="lotBlockPlan" defaultValue={contract.lotBlockPlan ?? ""} />
          </FormField>
          <FormField label="Purchase price">
            <Input
              name="purchasePrice"
              type="number"
              step="0.01"
              defaultValue={contract.purchasePrice ?? ""}
            />
          </FormField>
          <FormField label="Contract date">
            <Input
              name="contractDate"
              type="date"
              defaultValue={dateInputValue(contract.contractDate)}
            />
          </FormField>
          <FormField label="Target closing">
            <Input
              name="targetClosing"
              type="date"
              defaultValue={dateInputValue(contract.targetClosing)}
            />
          </FormField>
          <FormField label="Buyer first name">
            <Input
              name="buyerFirstName"
              defaultValue={contract.buyerFirstName ?? ""}
            />
          </FormField>
          <FormField label="Buyer last name">
            <Input name="buyerLastName" defaultValue={contract.buyerLastName ?? ""} />
          </FormField>
          <FormField label="Buyer email">
            <Input name="buyerEmail" type="email" defaultValue={contract.buyerEmail ?? ""} />
          </FormField>
          <FormField label="Buyer phone">
            <Input name="buyerPhone" type="tel" defaultValue={contract.buyerPhone ?? ""} />
          </FormField>
          <FormField label="Buyer mailing" className="md:col-span-2">
            <Input name="buyerMailing" defaultValue={contract.buyerMailing ?? ""} />
          </FormField>
          <FormField label="Builder name">
            <Input name="builderName" defaultValue={contract.builderName ?? ""} />
          </FormField>
          <FormField label="Review notes" className="md:col-span-2">
            <Textarea name="reviewNotes" defaultValue={contract.reviewNotes ?? ""} />
          </FormField>
          {!confirmed ? (
            <div className="md:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save review</SubmitButton>
            </div>
          ) : null}
        </ActionForm>
      </Card>

      {!confirmed ? (
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Confirm contract
          </h2>
          <p className="mt-2 text-sm text-sb-muted">
            Creates or updates the project, deposits, and conditions.
          </p>
          <ActionForm
            action={confirmContract}
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <FormField label="Assign project manager">
              <select
                name="pmId"
                defaultValue={defaultPmId}
                required={!contract.projectId}
                className="h-10 w-full rounded-[10px] border border-sb-border bg-white px-3 text-sm"
              >
                <option value="">Select PM</option>
                {pms.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                    {m.user.id === session.user.id ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-medium text-sb-ink">Deposits (optional)</p>
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2 rounded-[10px] border border-sb-border p-3">
                    <FormField label={`Deposit ${i} label`}>
                      <Input name={`depositLabel${i}`} defaultValue={`Deposit ${i}`} />
                    </FormField>
                    <FormField label="Amount">
                      <Input name={`depositAmount${i}`} type="number" step="0.01" />
                    </FormField>
                    <FormField label="Due date">
                      <Input name={`depositDue${i}`} type="date" />
                    </FormField>
                  </div>
                ))}
              </div>
            </div>
            <FormField label="Condition title">
              <Input name="conditionTitle" />
            </FormField>
            <FormField label="Condition due date">
              <Input name="conditionDue" type="date" />
            </FormField>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm text-sb-muted">
                Price: {formatCurrency(contract.purchasePrice)}
              </p>
              <SubmitButton pendingLabel="Creating project…">
                Confirm & create project
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : contract.project ? (
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Linked project
          </h2>
          <Link
            href={`/pm/projects/${contract.project.id}`}
            className="mt-2 inline-block text-sm font-medium hover:underline"
          >
            {contract.project.name} →
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
