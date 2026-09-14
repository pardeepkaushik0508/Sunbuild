import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractStatus, Role } from "@prisma/client";
import { PageHeader, Card, MetricCard } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { formatPersonOptionLabel } from "@/lib/users/person-label";
import {
  FileText,
  FileSpreadsheet,
  Printer,
  Download,
  Upload,
  Lock,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  Building,
  User,
  ArrowLeft,
  Calendar,
  Layers,
} from "lucide-react";
import {
  updatePurchaseContractAction,
  createContractRevisionAction,
  uploadSignedContractAction,
  executeContractAction,
  deleteDraftContractAction,
} from "@/lib/sales/contract-actions";

type PageProps = {
  params: Promise<{ id: string }>;
};

function dateInputValue(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function SalesContractWorkspacePage({ params }: PageProps) {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);
  const { id } = await params;
  const companyId = session.membership.companyId;

  const contract = await prisma.purchaseContract.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          projectManager: { select: { name: true, email: true } },
        },
      },
      scheduleOfAllowances: {
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            take: 6,
          },
        },
      },
      buyer: true,
      salesPerson: { select: { id: true, name: true, email: true } },
      uploadedBy: { select: { id: true, name: true } },
      versions: {
        orderBy: { version: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
    },
  });

  if (!contract) notFound();

  // Tenant security check
  if (contract.companyId && contract.companyId !== companyId) {
    notFound();
  }

  // Fetch Project Managers for execution assignment
  const pms = await prisma.membership.findMany({
    where: {
      companyId,
      role: Role.PROJECT_MANAGER,
      isActive: true,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const isExecuted = contract.status === ContractStatus.EXECUTED;
  const buyerDisplayName = contract.buyer
    ? fullName(contract.buyer.firstName, contract.buyer.lastName)
    : fullName(contract.buyerFirstName, contract.buyerLastName) || "—";
  const buyerContact = contract.buyer?.email || contract.buyerEmail || contract.buyerPhone || "";
  const soa = contract.scheduleOfAllowances;

  const updateContract = updatePurchaseContractAction.bind(null, contract.id);
  const createRevision = createContractRevisionAction.bind(null, contract.id);
  const uploadSigned = uploadSignedContractAction.bind(null, contract.id);
  const executeContract = executeContractAction.bind(null, contract.id);
  const deleteDraft = deleteDraftContractAction.bind(null, contract.id);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header & Main Navigation */}
      <PageHeader
        title={`${contract.contractNumber || "Contract Workspace"} (v${contract.version})`}
        description={`Buyer: ${buyerDisplayName} · Project: ${contract.projectName || contract.project?.name || "Unassigned"}`}
        icon={<FileText className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/sales/contracts">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                All Contracts
              </Button>
            </Link>

            {soa ? (
              <Link href={`/sales/soa/${soa.id}`}>
                <Button variant="outline" size="sm" className="text-blue-700 border-blue-200 bg-blue-50/50 hover:bg-blue-100/50">
                  <FileSpreadsheet className="mr-1.5 h-4 w-4 text-blue-600" />
                  Edit Allowances ({soa.soaNumber})
                </Button>
              </Link>
            ) : null}

            <a
              href={`/sales/contracts/${contract.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Printer className="mr-1.5 h-4 w-4 text-sb-muted" />
                Print / HTML
              </Button>
            </a>

            <a
              href={`/api/contracts/${contract.id}/pdf`}
              download={`${contract.contractNumber || "contract"}.pdf`}
            >
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4 text-sb-muted" />
                PDF
              </Button>
            </a>
          </div>
        }
      />

      {/* Top Banner: Status & Lock Warning */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-sb-border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <StatusBadge tone={statusTone(contract.status)} className="px-3 py-1 text-sm font-semibold">
            {contract.status.replace(/_/g, " ")}
          </StatusBadge>
          {isExecuted ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <Lock className="h-3.5 w-3.5" />
              Locked & Legally Binding ({formatDate(contract.executedAt)})
            </div>
          ) : (
            <span className="text-xs text-sb-muted">
              Created {formatDate(contract.createdAt)} by {contract.uploadedBy?.name || "Sales"}
            </span>
          )}
        </div>

        {contract.project ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-sb-muted">Active Project:</span>
            <Link
              href={`/pm/projects/${contract.project.id}`}
              className="font-semibold text-sb-ink hover:text-sb-orange hover:underline flex items-center gap-1"
            >
              <Building className="h-3.5 w-3.5 text-sb-muted" />
              {contract.project.name} →
            </Link>
          </div>
        ) : null}
      </div>

      {/* Financial Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Base Contract Price"
          value={formatCurrency(contract.basePrice ?? 0)}
          hint="Core structure, framing & mechanicals"
          accent="blue"
        />
        <MetricCard
          label="Schedule of Allowances"
          value={formatCurrency(contract.allowanceTotal ?? soa?.totalAllowance ?? 0)}
          hint={soa ? `${soa.soaNumber} (Budgeted)` : "Allowances total"}
          accent="orange"
        />
        <MetricCard
          label="Estimated GST (5%)"
          value={formatCurrency(contract.taxAmount ?? 0)}
          hint={`Tax rate: ${contract.taxRate ?? 5.0}%`}
          accent="purple"
        />
        <MetricCard
          label="Total Contract Price"
          value={formatCurrency(contract.totalContractPrice ?? contract.purchasePrice ?? 0)}
          hint={isExecuted ? "Legally executed baseline" : "Inclusive of base, SOA & tax"}
          accent="green"
        />
      </div>

      {/* Main Grid: Left Workspace & Right Action Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Contract Content & Edit Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Linked Schedule of Allowances (SOA) Highlights */}
          <Card className="border-l-4 border-l-sb-orange">
            <div className="flex items-center justify-between border-b border-sb-border pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-sb-orange" />
                <div>
                  <h3 className="font-semibold text-sb-ink">Schedule of Allowances (SOA)</h3>
                  <p className="text-xs text-sb-muted">
                    Budgeted allowances for finishings, fixtures, flooring & cabinetry
                  </p>
                </div>
              </div>
              {soa ? (
                <Link href={`/sales/soa/${soa.id}`}>
                  <Button size="sm" variant="outline" className="text-xs">
                    Manage SOA Items →
                  </Button>
                </Link>
              ) : null}
            </div>

            {soa ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-2 bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] text-center text-xs">
                  <div>
                    <span className="text-sb-muted block">Total Allowance</span>
                    <span className="font-mono font-bold text-sb-ink text-sm">
                      {formatCurrency(soa.totalAllowance)}
                    </span>
                  </div>
                  <div>
                    <span className="text-sb-muted block">Committed</span>
                    <span className="font-mono font-bold text-blue-600 text-sm">
                      {formatCurrency(soa.committedAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-sb-muted block">Remaining</span>
                    <span className="font-mono font-bold text-emerald-600 text-sm">
                      {formatCurrency(soa.remainingAmount)}
                    </span>
                  </div>
                </div>

                {soa.items.length > 0 ? (
                  <div className="divide-y divide-sb-border rounded-lg border border-sb-border overflow-hidden">
                    {soa.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2.5 bg-white text-xs">
                        <div>
                          <span className="font-medium text-sb-ink">{item.name}</span>
                          <span className="ml-2 text-sb-muted">({item.category})</span>
                        </div>
                        <span className="font-mono font-semibold text-sb-ink">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-sb-muted italic text-center py-2">
                    No individual allowance items added yet. Click &ldquo;Manage SOA Items&rdquo; to populate finishing categories.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-sb-muted">No SOA linked to this contract.</p>
            )}
          </Card>

          {/* Contract Details Form / Review Fields */}
          <Card>
            <div className="flex items-center justify-between border-b border-sb-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-sb-blue" />
                <h3 className="font-semibold text-sb-ink">Contract & Property Details</h3>
              </div>
              {isExecuted ? (
                <span className="flex items-center gap-1 text-xs text-sb-muted">
                  <Lock className="h-3 w-3" /> Read-Only (Executed)
                </span>
              ) : null}
            </div>

            <ActionForm
              action={updateContract}
              successMessage="Contract details saved"
              className="grid gap-4 md:grid-cols-2"
            >
              <FormField label="Project / Model Name">
                <Input
                  name="projectName"
                  defaultValue={contract.projectName ?? ""}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Builder Legal Name">
                <Input
                  name="builderName"
                  defaultValue={contract.builderName ?? "Sunview Custom Homes"}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Municipal Address" className="md:col-span-2">
                <Input
                  name="municipalAddress"
                  defaultValue={contract.municipalAddress ?? ""}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Legal Address">
                <Input
                  name="legalAddress"
                  defaultValue={contract.legalAddress ?? ""}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Lot / Block / Plan">
                <Input
                  name="lotBlockPlan"
                  defaultValue={contract.lotBlockPlan ?? ""}
                  disabled={isExecuted}
                />
              </FormField>

              <FormField label="Contract Date">
                <Input
                  name="contractDate"
                  type="date"
                  defaultValue={dateInputValue(contract.contractDate)}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Target Closing">
                <Input
                  name="targetClosing"
                  type="date"
                  defaultValue={dateInputValue(contract.targetClosing)}
                  disabled={isExecuted}
                />
              </FormField>

              {/* Financial Inputs */}
              <div className="md:col-span-2 border-t border-sb-border pt-4 mt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sb-muted mb-3">
                  Authoritative Pricing Breakdown
                </h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField label="Base Price ($ CAD)">
                    <Input
                      name="basePrice"
                      type="number"
                      step="0.01"
                      defaultValue={contract.basePrice ?? ""}
                      disabled={isExecuted}
                    />
                  </FormField>
                  <FormField label="Agreed Upgrades ($ CAD)">
                    <Input
                      name="upgradesTotal"
                      type="number"
                      step="0.01"
                      defaultValue={contract.upgradesTotal ?? ""}
                      disabled={isExecuted}
                    />
                  </FormField>
                  <FormField label="Discounts / Credits ($ CAD)">
                    <Input
                      name="discountsTotal"
                      type="number"
                      step="0.01"
                      defaultValue={contract.discountsTotal ?? ""}
                      disabled={isExecuted}
                    />
                  </FormField>
                </div>
              </div>

              {/* Scope & Terms */}
              <FormField label="Scope Summary" className="md:col-span-2">
                <Textarea
                  name="scopeSummary"
                  defaultValue={contract.scopeSummary ?? ""}
                  rows={3}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Specific Inclusions">
                <Textarea
                  name="inclusions"
                  defaultValue={contract.inclusions ?? ""}
                  rows={3}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Specific Exclusions">
                <Textarea
                  name="exclusions"
                  defaultValue={contract.exclusions ?? ""}
                  rows={3}
                  disabled={isExecuted}
                />
              </FormField>
              <FormField label="Special Conditions / Financing Terms" className="md:col-span-2">
                <Textarea
                  name="specialConditions"
                  defaultValue={contract.specialConditions ?? ""}
                  rows={2}
                  disabled={isExecuted}
                />
              </FormField>

              {/* Confidential Internal Notes */}
              <FormField
                label="Confidential Internal Builder Notes (Hidden from Client)"
                className="md:col-span-2"
              >
                <Textarea
                  name="internalNotes"
                  defaultValue={contract.internalNotes ?? ""}
                  rows={2}
                  className="bg-amber-50/50 border-amber-200"
                  disabled={isExecuted}
                />
              </FormField>

              {!isExecuted ? (
                <div className="md:col-span-2 flex justify-end">
                  <SubmitButton pendingLabel="Saving changes…">Save Contract Changes</SubmitButton>
                </div>
              ) : null}
            </ActionForm>
          </Card>
        </div>

        {/* Right Column (1 Col): Execution Workflow, Revisions & Buyer Profile */}
        <div className="space-y-6">
          {/* Buyer Card */}
          <Card>
            <div className="flex items-center gap-2 border-b border-sb-border pb-3 mb-3">
              <User className="h-4 w-4 text-sb-orange" />
              <h3 className="font-semibold text-sb-ink">Buyer Profile</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-sb-muted block">Full Name</span>
                <span className="font-medium text-sb-ink text-sm">{buyerDisplayName}</span>
              </div>
              {buyerContact ? (
                <div>
                  <span className="text-sb-muted block">Contact</span>
                  <span className="text-sb-ink">{buyerContact}</span>
                </div>
              ) : null}
              {contract.buyerMailing ? (
                <div>
                  <span className="text-sb-muted block">Mailing Address</span>
                  <span className="text-sb-ink">{contract.buyerMailing}</span>
                </div>
              ) : null}
              {contract.salesPerson ? (
                <div className="border-t border-sb-border pt-2 mt-2">
                  <span className="text-sb-muted block">Sales Agent</span>
                  <span className="font-medium text-sb-ink">{contract.salesPerson.name}</span>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Execution & Hand-off to Production Card */}
          {!isExecuted ? (
            <Card className="border-2 border-sb-orange/30 bg-sb-orange/5">
              <div className="flex items-center gap-2 border-b border-sb-orange/20 pb-3 mb-3">
                <ShieldCheck className="h-5 w-5 text-sb-orange" />
                <h3 className="font-bold text-sb-ink">Contract Execution</h3>
              </div>

              <p className="text-xs text-sb-muted mb-4">
                Executing locks all financial values, creates/activates the construction Project in PRE_CONSTRUCTION, synchronizes project selection categories with the SOA, and assigns a Project Manager.
              </p>

              {/* Step A: Upload Signed Agreement PDF (if not yet uploaded) */}
              {!contract.signedFilePath ? (
                <div className="mb-4 bg-white p-3 rounded-lg border border-sb-border">
                  <span className="text-xs font-semibold text-sb-ink block mb-1">
                    1. Upload Signed PDF (Optional)
                  </span>
                  <ActionForm
                    action={uploadSigned}
                    encType="multipart/form-data"
                    className="space-y-2"
                  >
                    <Input name="file" type="file" accept=".pdf,application/pdf" required className="text-xs" />
                    <SubmitButton size="sm" variant="outline" pendingLabel="Uploading…">
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Attach Signed PDF
                    </SubmitButton>
                  </ActionForm>
                </div>
              ) : (
                <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-xs text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="truncate">Signed file attached: {contract.signedFileName}</span>
                </div>
              )}

              {/* Step B: Execute Contract Action */}
              <ActionForm action={executeContract} className="space-y-3">
                <FormField label="Assign Project Manager">
                  <select
                    name="pmId"
                    required
                    className="h-9 w-full rounded-[8px] border border-sb-border bg-white px-2.5 text-xs text-sb-text"
                  >
                    <option value="">Select PM for hand-off</option>
                    {pms.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {formatPersonOptionLabel(m.user.name, {
                          role: Role.PROJECT_MANAGER,
                        })}
                      </option>
                    ))}
                  </select>
                </FormField>

                <SubmitButton
                  pendingLabel="Executing & locking contract…"
                  className="w-full bg-sb-orange hover:bg-sb-orange-dark text-white font-semibold py-2 text-xs"
                >
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                  Execute & Hand Off to Production
                </SubmitButton>
              </ActionForm>
            </Card>
          ) : (
            /* Executed Info Card */
            <Card className="border-2 border-emerald-300 bg-emerald-50/50">
              <div className="flex items-center gap-2 border-b border-emerald-200 pb-3 mb-3">
                <Lock className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-emerald-900">Contract Executed & Locked</h3>
              </div>
              <div className="space-y-2 text-xs text-emerald-800">
                <p>
                  <strong>Executed At:</strong> {formatDate(contract.executedAt)}
                </p>
                {contract.project?.projectManager ? (
                  <p>
                    <strong>Assigned PM:</strong> {contract.project.projectManager.name}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-emerald-700">
                  Financial totals are frozen. Any subsequent additions or deductions must be approved via client Change Orders.
                </p>
              </div>
            </Card>
          )}

          {/* Versioning & Revision History */}
          <Card>
            <div className="flex items-center justify-between border-b border-sb-border pb-3 mb-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-sb-purple" />
                <h3 className="font-semibold text-sb-ink">Revisions & Versions</h3>
              </div>
              <span className="text-xs text-sb-muted font-medium">Current: v{contract.version}</span>
            </div>

            {!isExecuted ? (
              <ActionForm action={createRevision} className="space-y-2 mb-4">
                <Input
                  name="reason"
                  placeholder="Reason for revision (e.g. Buyer changed base price)"
                  required
                  className="text-xs"
                />
                <SubmitButton size="sm" variant="outline" pendingLabel="Archiving version…">
                  <Layers className="mr-1.5 h-3.5 w-3.5 text-sb-muted" />
                  Create Revision (v{contract.version + 1})
                </SubmitButton>
              </ActionForm>
            ) : null}

            {contract.versions.length > 0 ? (
              <div className="space-y-2 divide-y divide-sb-border text-xs">
                {contract.versions.map((v) => (
                  <div key={v.id} className="pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sb-ink">Version {v.version}</span>
                      <span className="text-sb-muted">{formatDate(v.createdAt)}</span>
                    </div>
                    <p className="text-sb-muted mt-0.5">{v.reason || "Revision created"}</p>
                    <p className="font-mono text-sb-ink mt-0.5">
                      Price: {formatCurrency(v.purchasePrice)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-sb-muted italic">Initial version (no prior revisions).</p>
            )}
          </Card>

          {/* Delete Draft Action (Only unexecuted) */}
          {!isExecuted ? (
            <div className="pt-2">
              <form action={deleteDraft}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full text-sb-red border-red-200 hover:bg-red-50 text-xs"
                >
                  Discard Draft Contract
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
