import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";

export default async function PMContractsPage() {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const projectIds = await getAccessibleProjectIds(session);

  const contracts = await prisma.purchaseContract.findMany({
    where: {
      OR: [
        { projectId: { in: projectIds } },
        { projectId: null, uploadedById: session.user.id },
      ],
    },
    include: {
      project: { select: { id: true, name: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const canManage = session.membership.role !== Role.PROJECT_MANAGER && (
    session.membership.role === Role.OWNER ||
    session.membership.role === Role.OPERATIONS_ADMIN ||
    session.membership.role === Role.SALES_MANAGER
  );

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Purchase agreements and operational contracts"
        actions={
          canManage ? (
            <Link href="/pm/contracts/new">
              <Button size="sm">Upload contract</Button>
            </Link>
          ) : null
        }
      />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts"
          action={
            canManage ? (
              <Link href="/pm/contracts/new">
                <Button>Upload contract</Button>
              </Link>
            ) : undefined
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
                  className="font-medium hover:underline"
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
