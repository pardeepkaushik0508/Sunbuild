import Link from "next/link";
import { Role, ContractStatus } from "@prisma/client";
import { PageHeader, EmptyState, MetricCard } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { FileText, Plus, FileSpreadsheet, Eye, Printer } from "lucide-react";

export default async function SalesContractsPage() {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);

  const companyId = session.membership.companyId;

  const contracts = await prisma.purchaseContract.findMany({
    where: {
      OR: [
        { companyId },
        { uploadedById: session.user.id },
        { salesPersonId: session.user.id },
        { project: { companyId } },
      ],
    },
    include: {
      project: { select: { id: true, name: true, status: true } },
      scheduleOfAllowances: {
        select: {
          id: true,
          soaNumber: true,
          totalAllowance: true,
          committedAmount: true,
          remainingAmount: true,
        },
      },
      buyer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      salesPerson: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalContracts = contracts.length;
  const executedContracts = contracts.filter((c) => c.status === ContractStatus.EXECUTED);
  const pendingContracts = contracts.filter(
    (c) => c.status === ContractStatus.DRAFT || c.status === ContractStatus.READY_FOR_REVIEW || c.status === ContractStatus.IN_REVIEW || c.status === ContractStatus.SENT_TO_CLIENT
  );
  const totalValue = contracts.reduce(
    (acc, c) => acc + Number(c.totalContractPrice ?? c.purchasePrice ?? 0),
    0
  );
  const totalAllowances = contracts.reduce(
    (acc, c) => acc + Number(c.allowanceTotal ?? c.scheduleOfAllowances?.totalAllowance ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Contracts"
        description="Authoritative sales contracts, builder agreements, and client price commitments"
        icon={<FileText className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/sales/soa">
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="mr-1.5 h-4 w-4 text-sb-muted" />
                All Allowances (SOA)
              </Button>
            </Link>
            <Link href="/sales/contracts/new">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Purchase Contract
              </Button>
            </Link>
          </div>
        }
      />

      {/* Financial & Pipeline Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Contracts"
          value={totalContracts}
          hint={`${executedContracts.length} executed · ${pendingContracts.length} in review`}
          accent="blue"
        />
        <MetricCard
          label="Executed Agreements"
          value={executedContracts.length}
          hint="Active construction commitments"
          accent="green"
        />
        <MetricCard
          label="Total Contracted Value"
          value={formatCurrency(totalValue)}
          hint="Aggregate gross contract revenue"
          accent="purple"
        />
        <MetricCard
          label="Budgeted Allowances"
          value={formatCurrency(totalAllowances)}
          hint="Total Schedule of Allowances committed"
          accent="orange"
        />
      </div>

      {contracts.length === 0 ? (
        <EmptyState
          title="No purchase contracts found"
          description="Create your first client purchase contract or upload an existing PDF agreement to begin tracking client allowances and handover."
          action={
            <Link href="/sales/contracts/new">
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                Create Purchase Contract
              </Button>
            </Link>
          }
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search contracts, buyers, addresses, or status…"
          emptyMessage="No contracts match your search"
          columns={[
            { key: "contract", label: "Contract #" },
            { key: "buyer", label: "Buyer" },
            { key: "project", label: "Project / Address" },
            { key: "basePrice", label: "Base Price" },
            { key: "allowance", label: "SOA Allowance" },
            { key: "totalPrice", label: "Contract Total" },
            { key: "status", label: "Status" },
            { key: "actions", label: "Actions" },
          ]}
          rows={contracts.map((contract) => {
            const buyer =
              contract.buyer
                ? fullName(contract.buyer.firstName, contract.buyer.lastName)
                : fullName(contract.buyerFirstName, contract.buyerLastName) || "—";
            const buyerContact = contract.buyer?.email || contract.buyerEmail || contract.buyerPhone || "";
            const projectName =
              contract.project?.name ?? contract.projectName ?? contract.municipalAddress ?? "—";
            const contractNum = contract.contractNumber || `PC-${contract.id.slice(0, 8)}`;
            const basePriceNum = Number(contract.basePrice ?? 0);
            const allowanceNum = Number(
              contract.allowanceTotal ?? contract.scheduleOfAllowances?.totalAllowance ?? 0
            );
            const totalNum = Number(contract.totalContractPrice ?? contract.purchasePrice ?? 0);

            return {
              id: contract.id,
              searchText: [
                contractNum,
                `v${contract.version}`,
                buyer,
                buyerContact,
                projectName,
                contract.municipalAddress,
                contract.status,
                contract.scheduleOfAllowances?.soaNumber,
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                contract: contractNum,
                buyer,
                project: projectName,
                basePrice: basePriceNum,
                allowance: allowanceNum,
                totalPrice: totalNum,
                status: contract.status,
              },
              cells: [
                <Td key="contract">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sales/contracts/${contract.id}`}
                      className="font-semibold text-sb-ink hover:text-sb-orange hover:underline"
                    >
                      {contractNum}
                    </Link>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-sb-muted">
                      v{contract.version}
                    </span>
                  </div>
                  <p className="text-xs text-sb-muted">
                    {formatDate(contract.contractDate || contract.createdAt)}
                  </p>
                </Td>,
                <Td key="buyer">
                  <div className="font-medium text-sb-ink">{buyer}</div>
                  {buyerContact ? (
                    <div className="text-xs text-sb-muted truncate max-w-[180px]">
                      {buyerContact}
                    </div>
                  ) : null}
                </Td>,
                <Td key="project">
                  {contract.project ? (
                    <Link
                      href={`/pm/projects/${contract.project.id}`}
                      className="font-medium hover:underline text-sb-ink block"
                    >
                      {contract.project.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-sb-ink block">{projectName}</span>
                  )}
                  {contract.municipalAddress && contract.municipalAddress !== projectName ? (
                    <span className="text-xs text-sb-muted truncate max-w-[200px] block">
                      {contract.municipalAddress}
                    </span>
                  ) : null}
                </Td>,
                <Td key="basePrice" className="text-sb-muted font-mono text-xs">
                  {formatCurrency(basePriceNum)}
                </Td>,
                <Td key="allowance">
                  {contract.scheduleOfAllowances ? (
                    <Link
                      href={`/sales/soa/${contract.scheduleOfAllowances.id}`}
                      className="inline-flex items-center gap-1 font-mono text-xs font-medium text-blue-600 hover:underline"
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      {formatCurrency(allowanceNum)}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-sb-muted">
                      {formatCurrency(allowanceNum)}
                    </span>
                  )}
                </Td>,
                <Td key="totalPrice" className="font-semibold font-mono text-sb-ink">
                  {formatCurrency(totalNum)}
                </Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(contract.status)}>
                    {contract.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Td>,
                <Td key="actions">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/sales/contracts/${contract.id}`}>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Workspace
                      </Button>
                    </Link>
                    <a
                      href={`/sales/contracts/${contract.id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Print Contract">
                        <Printer className="h-3.5 w-3.5 text-sb-muted" />
                      </Button>
                    </a>
                  </div>
                </Td>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}
