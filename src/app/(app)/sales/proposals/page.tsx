import Link from "next/link";
import { ProposalStatus, Role } from "@prisma/client";
import { createProposalAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { InteractiveDataTable } from "@/components/ui/interactive-data-table";
import { Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";

export default async function SalesProposalsPage() {
  const session = await requireRole([Role.SALES_MANAGER, Role.OWNER]);
  const companyId = session.membership.companyId;

  const [proposals, leads] = await Promise.all([
    prisma.proposal.findMany({
      where: { companyId },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.lead.findMany({
      where: {
        companyId,
        status: { notIn: ["WON", "LOST"] },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        description="Create and track sales proposals linked to leads"
      />

      <Card>
        <h2 className="text-lg font-semibold text-sb-ink">Create proposal</h2>
        <ActionForm
          action={createProposalAction}
          successMessage="Proposal created"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Lead" required>
            <Select name="leadId" required defaultValue={leads[0]?.id ?? ""}>
              <option value="" disabled>
                Select lead
              </option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {fullName(l.firstName, l.lastName)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Title" required>
            <Input name="title" required placeholder="Proposal title" />
          </FormField>
          <FormField label="Amount">
            <Input name="amount" type="number" min="0" step="0.01" placeholder="0.00" />
          </FormField>
          <FormField label="Status" required>
            <Select name="status" defaultValue={ProposalStatus.DRAFT}>
              {Object.values(ProposalStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notes" className="md:col-span-2">
            <Textarea name="notes" rows={3} />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton
              disabled={leads.length === 0}
              pendingLabel="Saving…"
            >
              Save proposal
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {proposals.length === 0 ? (
        <EmptyState
          title="No proposals yet"
          description="Create a proposal for an open lead to track active proposals on the overview."
        />
      ) : (
        <InteractiveDataTable
          searchPlaceholder="Search proposals…"
          emptyMessage="No proposals match your search"
          columns={[
            { key: "proposal", label: "Proposal" },
            { key: "lead", label: "Lead" },
            { key: "amount", label: "Amount" },
            { key: "status", label: "Status" },
            { key: "updated", label: "Updated" },
            { key: "actions", label: "", sortable: false },
          ]}
          rows={proposals.map((p) => {
            const leadName = fullName(p.lead.firstName, p.lead.lastName);
            return {
              id: p.id,
              searchText: [
                p.title,
                p.createdBy.name,
                leadName,
                p.status,
                formatCurrency(p.amount),
              ]
                .filter(Boolean)
                .join(" "),
              sortValues: {
                proposal: p.title,
                lead: leadName,
                amount: Number(p.amount ?? 0),
                status: p.status,
                updated: p.updatedAt.getTime(),
              },
              cells: [
                <Td key="proposal">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-sb-muted">{p.createdBy.name}</p>
                </Td>,
                <Td key="lead">{leadName}</Td>,
                <Td key="amount">{formatCurrency(p.amount)}</Td>,
                <Td key="status">
                  <StatusBadge tone={statusTone(p.status)}>{p.status}</StatusBadge>
                </Td>,
                <Td key="updated">{formatDate(p.updatedAt)}</Td>,
                <Td key="actions">
                  <Link
                    href={`/sales/leads/${p.lead.id}`}
                    className="text-sm font-medium text-[#f97316]"
                  >
                    Open lead
                  </Link>
                </Td>,
              ],
            };
          })}
        />
      )}
    </div>
  );
}
