import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
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
        <DataTable
          headers={[
            "Contract",
            "Buyer",
            "Project",
            "Price",
            "Status",
            "Uploaded",
          ]}
        >
          {contracts.map((contract) => (
            <tr key={contract.id}>
              <Td>
                <Link
                  href={`/pm/contracts/${contract.id}`}
                  className="font-medium hover:underline text-sb-ink"
                >
                  {contract.contractNumber ?? contract.fileName}
                </Link>
              </Td>
              <Td>
                {fullName(contract.buyerFirstName, contract.buyerLastName)}
              </Td>
              <Td>
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
              </Td>
              <Td>{formatCurrency(contract.purchasePrice)}</Td>
              <Td>
                <StatusBadge tone={statusTone(contract.status)}>
                  {contract.status.replace(/_/g, " ")}
                </StatusBadge>
              </Td>
              <Td>
                {contract.uploadedBy.name}
                <p className="text-xs text-sb-muted">
                  {formatDate(contract.createdAt)}
                </p>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
