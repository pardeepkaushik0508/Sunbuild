import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { PageHeader, MetricCard, ProgressBar } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { analyzeSoaItems } from "@/lib/contracts/soa-recommendations";
import {
  FileSpreadsheet,
  FileText,
  Printer,
  Download,
  ArrowLeft,
  Building,
  User,
  Lock,
} from "lucide-react";
import { SoaEditor } from "./soa-editor";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SoaDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);
  const { id } = await params;
  const companyId = session.membership.companyId;

  const soa = await prisma.scheduleOfAllowances.findUnique({
    where: { id },
    include: {
      contract: {
        select: {
          id: true,
          contractNumber: true,
          version: true,
          status: true,
          projectName: true,
          buyerFirstName: true,
          buyerLastName: true,
          municipalAddress: true,
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
      project: { select: { id: true, name: true, status: true } },
      items: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!soa) notFound();

  // Tenant security check
  if (soa.companyId && soa.companyId !== companyId) {
    notFound();
  }

  const buyerName = soa.buyer
    ? fullName(soa.buyer.firstName, soa.buyer.lastName)
    : fullName(soa.contract?.buyerFirstName, soa.contract?.buyerLastName) || "—";
  const projectName = soa.project?.name ?? soa.contract?.projectName ?? "Unassigned";

  // Run AI / Sanity recommendations
  const recommendations = analyzeSoaItems(soa.items);

  const total = Number(soa.totalAllowance ?? 0);
  const committed = Number(soa.committedAmount ?? 0);
  const remaining = Number(soa.remainingAmount ?? 0);
  const overages = Number(soa.overageAmount ?? 0);
  const committedPercent = total > 0 ? Math.round((committed / total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <PageHeader
        title={`${soa.soaNumber} (v${soa.version})`}
        description={`Schedule of Allowances for ${buyerName} · Project: ${projectName}`}
        icon={<FileSpreadsheet className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/sales/soa">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                All SOA
              </Button>
            </Link>

            {soa.contract ? (
              <Link href={`/sales/contracts/${soa.contract.id}`}>
                <Button variant="outline" size="sm">
                  <FileText className="mr-1.5 h-4 w-4 text-sb-muted" />
                  Contract ({soa.contract.contractNumber || "PC"})
                </Button>
              </Link>
            ) : null}

            <a
              href={`/sales/soa/${soa.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Printer className="mr-1.5 h-4 w-4 text-sb-muted" />
                Print / HTML
              </Button>
            </a>

            <a
              href={`/api/soa/${soa.id}/pdf`}
              download={`${soa.soaNumber}.pdf`}
            >
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4 text-sb-muted" />
                PDF
              </Button>
            </a>
          </div>
        }
      />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-sb-border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <StatusBadge tone={statusTone(soa.status)} className="px-3 py-1 text-sm font-semibold">
            {soa.status.replace(/_/g, " ")}
          </StatusBadge>
          {soa.status === "LOCKED" ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <Lock className="h-3.5 w-3.5" />
              Locked & Legally Executed
            </div>
          ) : (
            <span className="text-xs text-sb-muted">
              Created {formatDate(soa.createdAt)} · Active allowance schedule
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs">
          {soa.project ? (
            <div className="flex items-center gap-1 text-sb-ink">
              <Building className="h-3.5 w-3.5 text-sb-muted" />
              <Link href={`/pm/projects/${soa.project.id}`} className="hover:underline font-medium">
                {soa.project.name}
              </Link>
            </div>
          ) : null}
          <div className="flex items-center gap-1 text-sb-ink">
            <User className="h-3.5 w-3.5 text-sb-muted" />
            <span className="font-medium">{buyerName}</span>
          </div>
        </div>
      </div>

      {/* Financial Health Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Allowance Budget"
          value={formatCurrency(total)}
          hint="Total contractual client allowance"
          accent="blue"
        />
        <MetricCard
          label="Committed to Selections"
          value={formatCurrency(committed)}
          hint={`${committedPercent}% of total allowance committed`}
          accent="purple"
        />
        <MetricCard
          label="Unallocated Remaining"
          value={formatCurrency(remaining)}
          hint="Available budget for client decisions"
          accent="green"
        />
        <MetricCard
          label="Cumulative Overages"
          value={formatCurrency(overages)}
          hint="Exceeding allowance budget"
          accent={overages > 0 ? "red" : "blue"}
        />
      </div>

      {/* Progress Bar */}
      <div className="rounded-xl border border-sb-border bg-white p-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-sb-ink">Allowance Consumption Progress</span>
          <span className="font-mono text-sb-muted font-medium">
            {formatCurrency(committed)} / {formatCurrency(total)} ({committedPercent}%)
          </span>
        </div>
        <ProgressBar
          value={committedPercent}
          color={overages > 0 ? "orange" : "blue"}
        />
      </div>

      {/* Interactive Item Editor */}
      <SoaEditor
        soa={{
          id: soa.id,
          soaNumber: soa.soaNumber,
          version: soa.version,
          status: soa.status,
          totalAllowance: total,
          committedAmount: committed,
          remainingAmount: remaining,
          overageAmount: overages,
          contractId: soa.contractId,
          contractStatus: soa.contract?.status,
        }}
        items={soa.items.map((it) => ({
          id: it.id,
          category: it.category,
          name: it.name,
          description: it.description,
          location: it.location,
          quantity: it.quantity ? Number(it.quantity) : null,
          unit: it.unit,
          amount: Number(it.amount),
          actualCost: it.actualCost !== null ? Number(it.actualCost) : null,
          status: it.status,
          costCode: it.costCode,
          selectionRequired: it.selectionRequired,
          selectionDueDate: it.selectionDueDate,
          displayToClient: it.displayToClient,
          notes: it.notes,
        }))}
        recommendations={recommendations}
      />
    </div>
  );
}
