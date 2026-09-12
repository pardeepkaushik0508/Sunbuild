import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";

export default async function SalesContractsPage() {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);

  const contracts = await prisma.purchaseContract.findMany({
    where: {
      OR: [
        { uploadedById: session.user.id },
        { project: { companyId: session.membership.companyId } },
      ],
    },
    include: {
      project: { select: { id: true, name: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Contracts & Agreements"
        description="Manage purchase contracts, client commitments, and builder agreements"
        actions={
          <Link href="/sales/contracts/new">
            <Button size="sm">Upload contract</Button>
          </Link>
        }
      />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts found"
          description="Upload buyer purchase agreements to initialize contract review and project handover."
          action={
            <Link href="/sales/contracts/new">
              <Button>Upload contract</Button>
            </Link>
          }
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search contracts…"
          emptyMessage="No contracts match your search"
          columns={[
            { key: "contract", label: "Contract" },
            { key: "buyer", label: "Buyer" },
            { key: "project", label: "Project" },
            { key: "price", label: "Price" },
            { key: "status", label: "Status" },
            { key: "uploaded", label: "Uploaded" },
          ]}
          rows={contracts.map((contract) => {
            const buyer = fullName(
              contract.buyerFirstName,
              contract.buyerLastName
            );
            const projectName =
              contract.project?.name ?? contract.projectName ?? "—";
            return {
              id: contract.id,
              searchText: [
                contract.contractNumber,
                contract.fileName,
                buyer,
                projectName,
                contract.status,
                contract.uploadedBy.name,
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                contract: contract.contractNumber ?? contract.fileName,
                buyer,
                project: projectName,
                price: Number(contract.purchasePrice ?? 0),
                status: contract.status,
                uploaded: contract.createdAt.getTime(),
              },
              cells: [
                <Td key="contract">
                  <Link
                    href={`/pm/contracts/${contract.id}`}
                    className="font-medium hover:underline text-sb-ink"
                  >
                    {contract.contractNumber ?? contract.fileName}
                  </Link>
                </Td>,
                <Td key="buyer">{buyer}</Td>,
                <Td key="project">
                  {contract.project ? (
                    <Link
                      href={`/pm/projects/${contract.project.id}`}
                      className="hover:underline"
                    >
                      {contract.project.name}
                    </Link>
                  ) : (
                    contract.projectName ?? "—"
                  )}
                </Td>,
                <Td key="price">{formatCurrency(contract.purchasePrice)}</Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(contract.status)}>
                    {contract.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Td>,
                <Td key="uploaded">
                  {contract.uploadedBy.name}
                  <p className="text-xs text-sb-muted">
                    {formatDate(contract.createdAt)}
                  </p>
                </Td>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}
