import Link from "next/link";
import { InvoiceStatus, Role } from "@prisma/client";
import {
  uploadInvoiceAction,
  updateInvoiceStatusAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function BookkeeperInvoicesPage() {
  const session = await requireRole([Role.BOOKKEEPER, Role.OWNER]);
  const companyId = session.membership.companyId;

  const [invoices, projects] = await Promise.all([
    prisma.invoice.findMany({
      where: { project: { companyId } },
      include: {
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { name: true } },
      },
      orderBy: { issueDate: "desc" },
    }),
    prisma.project.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Upload and track project invoices"
        actions={
          <Link href="/bookkeeper">
            <Button variant="outline" size="sm">
              Overview
            </Button>
          </Link>
        }
      />

      <Card className="mb-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Upload invoice
        </h2>
        <form
          action={uploadInvoiceAction}
          encType="multipart/form-data"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project">
            <Select name="projectId" required defaultValue="">
              <option value="" disabled>
                Select project
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Invoice number">
            <Input name="invoiceNumber" required placeholder="INV-2026-001" />
          </FormField>
          <FormField label="Amount (CAD)">
            <Input name="amount" type="number" step="0.01" min="0" required />
          </FormField>
          <FormField label="Issue date">
            <Input
              name="issueDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </FormField>
          <FormField label="Due date">
            <Input name="dueDate" type="date" />
          </FormField>
          <FormField label="Status">
            <Select name="status" defaultValue={InvoiceStatus.SENT}>
              {[
                InvoiceStatus.DRAFT,
                InvoiceStatus.SENT,
                InvoiceStatus.VIEWED,
                InvoiceStatus.OVERDUE,
              ].map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="PDF file">
            <Input name="file" type="file" accept=".pdf,application/pdf" />
          </FormField>
          <FormField label="Notes" className="md:col-span-2">
            <Textarea name="notes" placeholder="Payment terms, line items..." />
          </FormField>
          <div className="md:col-span-2">
            <Button type="submit">Upload invoice</Button>
          </div>
        </form>
      </Card>

      <DataTable
        headers={[
          "Invoice",
          "Project",
          "Amount",
          "Issue date",
          "Due",
          "Status",
          "File",
        ]}
      >
        {invoices.map((invoice) => (
          <tr key={invoice.id}>
            <Td>
              <p className="font-medium">{invoice.invoiceNumber}</p>
              <p className="text-xs text-sb-muted">
                by {invoice.uploadedBy.name}
              </p>
            </Td>
            <Td>
              <Link
                href={`/pm/projects/${invoice.project.id}`}
                className="text-sb-black hover:underline"
              >
                {invoice.project.name}
              </Link>
            </Td>
            <Td>{formatCurrency(invoice.amount)}</Td>
            <Td>{formatDate(invoice.issueDate)}</Td>
            <Td>{formatDate(invoice.dueDate)}</Td>
            <Td>
              <form
                action={updateInvoiceStatusAction.bind(null, invoice.id)}
                className="flex items-center gap-2"
              >
                <Select
                  name="status"
                  defaultValue={invoice.status}
                  className="min-w-[7rem] text-xs"
                >
                  {Object.values(InvoiceStatus)
                    .filter((s) => s !== InvoiceStatus.DRAFT)
                    .map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                </Select>
                <Button type="submit" size="sm" variant="outline">
                  Update
                </Button>
              </form>
              <div className="mt-1">
                <StatusBadge tone={statusTone(invoice.status)}>
                  {invoice.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
            </Td>
            <Td>
              {invoice.filePath ? (
                <a
                  href={`/api/files/${invoice.filePath}`}
                  className="text-sm text-sb-black underline hover:text-sb-yellow-dark"
                  target="_blank"
                  rel="noreferrer"
                >
                  {invoice.fileName ?? "View"}
                </a>
              ) : (
                "—"
              )}
            </Td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
