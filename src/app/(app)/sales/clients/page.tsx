import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader, EmptyState, MetricCard } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, fullName } from "@/lib/utils";
import { Users, FileText, Plus, Eye, Building } from "lucide-react";

export default async function SalesClientsPage() {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);

  const companyId = session.membership.companyId;

  const buyers = await prisma.buyer.findMany({
    where: {
      OR: [
        { clientProjects: { some: { companyId } } },
        { purchaseContracts: { some: { companyId } } },
        { purchaseContracts: { some: { uploadedById: session.user.id } } },
      ],
    },
    include: {
      clientProjects: {
        where: { companyId },
        select: { id: true, name: true, status: true },
      },
      purchaseContracts: {
        where: {
          OR: [
            { companyId },
            { uploadedById: session.user.id },
          ],
        },
        select: {
          id: true,
          contractNumber: true,
          status: true,
          totalContractPrice: true,
          purchasePrice: true,
          version: true,
        },
      },
    },
    orderBy: { lastName: "asc" },
  });

  const totalClients = buyers.length;
  const totalContracts = buyers.reduce(
    (acc, b) => acc + b.purchaseContracts.length,
    0
  );
  const totalProjects = buyers.reduce(
    (acc, b) => acc + b.clientProjects.length,
    0
  );
  const totalValue = buyers.reduce(
    (acc, b) =>
      acc +
      b.purchaseContracts.reduce(
        (sub, c) => sub + Number(c.totalContractPrice ?? c.purchasePrice ?? 0),
        0
      ),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients & Buyers"
        description="Homebuyer profiles, active commitments, purchase agreements, and linked build projects"
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/sales/contracts/new">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Contract
              </Button>
            </Link>
          </div>
        }
      />

      {/* Financial & Pipeline Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Homebuyers"
          value={totalClients}
          hint="Registered clients & buyers"
          accent="blue"
        />
        <MetricCard
          label="Active Contracts"
          value={totalContracts}
          hint="Draft, review & executed contracts"
          accent="purple"
        />
        <MetricCard
          label="Active Build Projects"
          value={totalProjects}
          hint="Linked construction sites"
          accent="green"
        />
        <MetricCard
          label="Total Client Value"
          value={formatCurrency(totalValue)}
          hint="Cumulative contract commitments"
          accent="orange"
        />
      </div>

      {buyers.length === 0 ? (
        <EmptyState
          title="No clients found"
          description="Clients and homebuyers are automatically created when generating purchase agreements or converting sales leads."
          action={
            <Link href="/sales/contracts/new">
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                Create First Contract
              </Button>
            </Link>
          }
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search clients by name, email, phone, or project…"
          emptyMessage="No clients match your search"
          columns={[
            { key: "client", label: "Client Name" },
            { key: "contact", label: "Contact Info" },
            { key: "contracts", label: "Contracts" },
            { key: "projects", label: "Linked Projects" },
            { key: "totalValue", label: "Contract Value" },
            { key: "actions", label: "Actions" },
          ]}
          rows={buyers.map((b) => {
            const name = fullName(b.firstName, b.lastName);
            const totalClientPrice = b.purchaseContracts.reduce(
              (sum, c) => sum + Number(c.totalContractPrice ?? c.purchasePrice ?? 0),
              0
            );

            return {
              id: b.id,
              searchText: [
                name,
                b.email,
                b.phone,
                b.mailingAddress,
                b.clientProjects.map((p) => p.name).join(" "),
                b.purchaseContracts.map((c) => c.contractNumber).join(" "),
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                client: name,
                contact: b.email || b.phone || "",
                contracts: b.purchaseContracts.length,
                projects: b.clientProjects.length,
                totalValue: totalClientPrice,
              },
              cells: [
                <Td key="client">
                  <div className="font-semibold text-sb-ink">{name}</div>
                  {b.mailingAddress ? (
                    <p className="text-xs text-sb-muted truncate max-w-xs">{b.mailingAddress}</p>
                  ) : null}
                </Td>,
                <Td key="contact">
                  {b.email ? <div className="text-xs text-sb-ink">{b.email}</div> : null}
                  {b.phone ? <div className="text-xs text-sb-muted">{b.phone}</div> : null}
                </Td>,
                <Td key="contracts">
                  {b.purchaseContracts.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {b.purchaseContracts.map((c) => (
                        <Link
                          key={c.id}
                          href={`/sales/contracts/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-sb-ink hover:text-sb-orange hover:underline"
                        >
                          <FileText className="h-3 w-3 text-sb-muted" />
                          <span>{c.contractNumber || "PC"}</span>
                          <StatusBadge tone={statusTone(c.status)} className="text-[10px] py-0 px-1.5">
                            {c.status}
                          </StatusBadge>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-sb-muted">—</span>
                  )}
                </Td>,
                <Td key="projects">
                  {b.clientProjects.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {b.clientProjects.map((p) => (
                        <Link
                          key={p.id}
                          href={`/pm/projects/${p.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-sb-ink hover:underline"
                        >
                          <Building className="h-3 w-3 text-sb-muted" />
                          {p.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-sb-muted">—</span>
                  )}
                </Td>,
                <Td key="totalValue" className="font-mono font-semibold text-sb-ink">
                  {formatCurrency(totalClientPrice)}
                </Td>,
                <Td key="actions">
                  <div className="flex items-center gap-1.5">
                    {b.purchaseContracts[0] ? (
                      <Link href={`/sales/contracts/${b.purchaseContracts[0].id}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          Contract
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/sales/contracts/new?buyerId=${b.id}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Contract
                        </Button>
                      </Link>
                    )}
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
