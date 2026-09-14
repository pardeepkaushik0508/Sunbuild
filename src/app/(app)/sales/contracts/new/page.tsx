import Link from "next/link";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { FileText, ArrowLeft } from "lucide-react";
import { ContractCreateForm } from "./contract-create-form";

type PageProps = {
  searchParams: Promise<{ projectId?: string; leadId?: string }>;
};

export default async function SalesContractNewPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.SALES_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.CEO,
  ]);

  const { projectId, leadId } = await searchParams;
  const companyId = session.membership.companyId;

  // 1. Projects for company
  const projects = await prisma.project.findMany({
    where: { companyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // 2. Leads for company (unconverted or relevant)
  const rawLeads = await prisma.lead.findMany({
    where: { companyId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const leads = rawLeads.map((l) => ({
    id: l.id,
    name: `${l.firstName} ${l.lastName}`.trim() || "Unnamed Lead",
    email: l.email,
    phone: l.phone,
  }));

  // 3. Existing Buyers
  const buyers = await prisma.buyer.findMany({
    where: {
      OR: [
        { projects: { some: { companyId } } },
        { contracts: { some: { companyId } } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    orderBy: { lastName: "asc" },
    take: 50,
  });

  const defaultProjectId =
    projectId && projects.some((p) => p.id === projectId) ? projectId : "";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        title="New Purchase Contract"
        description="Draft an authoritative buyer purchase agreement and initialize Schedule of Allowances (SOA)"
        icon={<FileText className="h-5 w-5" />}
        actions={
          <Link href="/sales/contracts">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All Contracts
            </Button>
          </Link>
        }
      />

      <ContractCreateForm
        projects={projects}
        leads={leads}
        buyers={buyers}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}
