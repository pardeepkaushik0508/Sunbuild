import {
  addSelectionItemAction,
  createSelectionSectionAction,
  removeMaterialListAction,
  setSectionBudgetAction,
  uploadMaterialListAction,
} from "@/lib/pm/selection-actions";
import { createSelectionPackageAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { DataTable, Td } from "@/components/ui/table";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { redirect } from "next/navigation";
import { PmProjectPicker } from "@/components/pm/project-picker";
import { Role, SelectionSectionStatus } from "@prisma/client";
import Link from "next/link";

type PageProps = {
  searchParams: Promise<{
    projectId?: string;
    view?: string;
    packageId?: string;
    q?: string;
    category?: string;
  }>;
};

async function createPackageFormAction(form: FormData) {
  "use server";
  const projectId = form.get("projectId")?.toString().trim() ?? "";
  if (!projectId) throw new Error("Project required");
  const id = await createSelectionPackageAction(projectId);
  redirect(`/pm/selections?projectId=${projectId}&packageId=${id}&view=budget`);
}

export default async function PMSelectionsPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const sp = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const selectedId = await getSelectedProjectId(session, sp.projectId);
  const view =
    sp.view === "board" || sp.view === "tracker" || sp.view === "catalog"
      ? sp.view
      : "budget";

  if (!selectedId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Selections"
          description="Select a project to manage selection packages"
        />
        <EmptyState
          title="No project selected"
          description="Choose a project first to open Budget, Board, and Tracker views."
          action={
            <Link href="/pm/projects">
              <Button>Project Selection</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const [project, packages, projects] = await Promise.all([
    prisma.project.findFirst({
      where: { id: selectedId },
      include: {
        buyer: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.selectionPackage.findMany({
      where: { projectId: selectedId },
      include: {
        sections: {
          include: {
            items: { orderBy: { sortOrder: "asc" } },
            _count: { select: { items: true, approvals: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: {
        buyer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const activePackage =
    packages.find((p) => p.id === sp.packageId) ?? packages[0] ?? null;

  const query = sp.q?.trim().toLowerCase() ?? "";
  const categoryFilter = sp.category?.trim() ?? "";

  const budgetRows =
    activePackage?.sections.flatMap((section) =>
      section.items
        .filter((item) => {
          if (categoryFilter && section.name !== categoryFilter) return false;
          if (!query) return true;
          const hay = [
            section.name,
            item.label,
            item.optionValue,
            item.notes,
            item.vendor,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(query);
        })
        .map((item) => ({ section, item }))
    ) ?? [];

  const viewHref = (v: string) => {
    const params = new URLSearchParams();
    params.set("projectId", selectedId);
    params.set("view", v);
    if (activePackage) params.set("packageId", activePackage.id);
    return `/pm/selections?${params.toString()}`;
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Client Selections"
        description="Budget, Board, and Tracker share one selection dataset"
        actions={
          <div className="flex flex-wrap gap-2">
            {(["budget", "board", "tracker", "catalog"] as const).map((v) => (
              <Link key={v} href={viewHref(v)}>
                <Button
                  size="sm"
                  variant={view === v ? "primary" : "outline"}
                >
                  {v === "catalog" ? "Product Selection" : v[0].toUpperCase() + v.slice(1)}
                </Button>
              </Link>
            ))}
          </div>
        }
      />

      <Card className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <PmProjectPicker
          compact
          selectedProjectId={selectedId}
          returnTo={`/pm/selections?view=${view}`}
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            municipalAddress: p.municipalAddress,
            status: p.status,
            buyerName: p.buyer
              ? fullName(p.buyer.firstName, p.buyer.lastName)
              : null,
          }))}
        />
        <div className="text-sm text-sb-muted">
          Client:{" "}
          <span className="font-medium text-sb-ink">
            {project?.buyer
              ? fullName(project.buyer.firstName, project.buyer.lastName)
              : "—"}
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-sb-ink">Material list</h2>
            <p className="text-sm text-sb-muted">
              {project?.materialListName
                ? `Uploaded: ${project.materialListName} · ${formatDate(project.materialListAt)}`
                : "Upload a CSV with Category, Item, Specification, quantities, and costs"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {project?.materialListPath ? (
              <>
                <a href={`/api/files/${project.materialListPath}`}>
                  <Button type="button" variant="outline" size="sm">
                    Download
                  </Button>
                </a>
                <form action={removeMaterialListAction}>
                  <input type="hidden" name="projectId" value={selectedId} />
                  <Button type="submit" variant="outline" size="sm">
                    Remove
                  </Button>
                </form>
              </>
            ) : null}
          </div>
        </div>
        <form
          action={uploadMaterialListAction}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          encType="multipart/form-data"
        >
          <input type="hidden" name="projectId" value={selectedId} />
          <FormField label="Upload list (CSV)" className="flex-1" required>
            <Input name="file" type="file" accept=".csv,text/csv" required />
          </FormField>
          <Button type="submit">Upload List</Button>
        </form>
      </Card>

      {packages.length === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold text-sb-ink">
            Create Selection Sheet
          </h2>
          <p className="mt-1 text-sm text-sb-muted">
            Creates the standard selection package for this project.
          </p>
          <form action={createPackageFormAction} className="mt-4">
            <input type="hidden" name="projectId" value={selectedId} />
            <Button type="submit">Create Selection Sheet</Button>
          </form>
        </Card>
      ) : null}

      {!activePackage ? (
        <EmptyState title="No selection package yet" />
      ) : view === "budget" ? (
        <div className="space-y-4">
          <Card className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <form method="get" className="flex flex-1 flex-col gap-3 sm:flex-row">
              <input type="hidden" name="projectId" value={selectedId} />
              <input type="hidden" name="view" value="budget" />
              <input type="hidden" name="packageId" value={activePackage.id} />
              <FormField label="Search" className="flex-1">
                <Input name="q" defaultValue={sp.q ?? ""} placeholder="Item, spec…" />
              </FormField>
              <FormField label="Category">
                <Select name="category" defaultValue={categoryFilter}>
                  <option value="">All</option>
                  {activePackage.sections.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button type="submit" variant="outline">
                Filter
              </Button>
            </form>
            <details className="rounded-[12px] border border-sb-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Set Budget
              </summary>
              <form action={setSectionBudgetAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <FormField label="Category" required>
                  <Select name="sectionId" required defaultValue="">
                    <option value="" disabled>
                      Select category
                    </option>
                    {activePackage.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.allowance != null
                          ? ` (${formatCurrency(s.allowance)})`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Budget Amount" required>
                  <Input
                    name="budgetAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <Button type="submit" size="sm">
                    Save budget
                  </Button>
                </div>
              </form>
            </details>
          </Card>

          <DataTable
            headers={[
              "Category",
              "Item",
              "Specification",
              "Qty Req",
              "Qty Allotted",
              "Unit Cost",
              "Total Cost",
            ]}
          >
            {budgetRows.length === 0 ? (
              <tr>
                <Td colSpan={7}>
                  <p className="py-8 text-center text-sm text-sb-muted">
                    No budget rows yet. Upload a material list or add items.
                  </p>
                </Td>
              </tr>
            ) : (
              budgetRows.map(({ section, item }) => (
                <tr key={item.id} className="hover:bg-sb-canvas/60">
                  <Td>{section.name}</Td>
                  <Td className="font-medium">{item.label}</Td>
                  <Td>{item.optionValue || item.notes || "—"}</Td>
                  <Td>{item.qtyRequired ?? "—"}</Td>
                  <Td>{item.qtyAllotted ?? "—"}</Td>
                  <Td>{formatCurrency(item.unitCost)}</Td>
                  <Td>{formatCurrency(item.selectedCost)}</Td>
                </tr>
              ))
            )}
          </DataTable>
        </div>
      ) : view === "board" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activePackage.sections.map((section) => {
            const used = section.items.reduce(
              (sum, i) => sum + (i.selectedCost ?? 0),
              0
            );
            return (
              <article
                key={section.id}
                className="rounded-[16px] border border-sb-border bg-sb-surface p-4 shadow-[var(--sb-shadow)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sb-ink">{section.name}</h3>
                  <StatusBadge tone={statusTone(section.status)}>
                    {section.status.replace(/_/g, " ")}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-sm text-sb-muted">
                  {section._count.items} item{section._count.items === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-sm">
                  Budget:{" "}
                  <span className="font-semibold">
                    {formatCurrency(section.allowance)}
                  </span>
                </p>
                <p className="text-sm">
                  Used:{" "}
                  <span className="font-semibold">{formatCurrency(used)}</span>
                </p>
                <p className="mt-2 text-xs text-sb-muted">
                  Updated {formatDate(section.updatedAt)}
                </p>
                <Link
                  href={`/pm/selections/${activePackage.id}`}
                  className="mt-3 inline-block text-sm font-medium text-sb-orange"
                >
                  Open detail →
                </Link>
              </article>
            );
          })}
          <details className="rounded-[16px] border border-dashed border-sb-border bg-sb-canvas/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-sb-ink">
              + Create New
            </summary>
            <form action={createSelectionSectionAction} className="mt-3 space-y-3">
              <input type="hidden" name="packageId" value={activePackage.id} />
              <FormField label="Category name" required>
                <Input name="name" required placeholder="e.g. Kitchen Cabinets" />
              </FormField>
              <FormField label="Description">
                <Input name="notes" placeholder="Client-facing description" />
              </FormField>
              <FormField label="Budget amount">
                <Input name="budgetAmount" type="number" min="0" step="0.01" />
              </FormField>
              <FormField label="Due date">
                <Input name="dueDate" type="date" />
              </FormField>
              <FormField label="Priority">
                <Select name="priority" defaultValue="MEDIUM">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </Select>
              </FormField>
              <Button type="submit" size="sm">
                Create category
              </Button>
            </form>
          </details>
        </div>
      ) : view === "tracker" ? (
        <DataTable
          headers={[
            "Category",
            "Items",
            "Status",
            "Budget",
            "Used",
            "Variance",
            "Approvals",
            "",
          ]}
        >
          {activePackage.sections.map((section) => {
            const used = section.items.reduce(
              (sum, i) => sum + (i.selectedCost ?? 0),
              0
            );
            const budget = section.allowance ?? 0;
            const variance = used - budget;
            return (
              <tr key={section.id}>
                <Td className="font-medium">{section.name}</Td>
                <Td>{section._count.items}</Td>
                <Td>
                  <StatusBadge tone={statusTone(section.status)}>
                    {section.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Td>
                <Td>{formatCurrency(section.allowance)}</Td>
                <Td>{formatCurrency(used)}</Td>
                <Td
                  className={
                    variance > 0 ? "font-semibold text-sb-red" : undefined
                  }
                >
                  {section.allowance == null
                    ? "—"
                    : `${variance > 0 ? "+" : ""}${formatCurrency(variance)}`}
                </Td>
                <Td>{section._count.approvals}</Td>
                <Td>
                  <Link
                    href={`/pm/selections/${activePackage.id}`}
                    className="text-sm font-medium text-sb-orange"
                  >
                    Review
                  </Link>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {activePackage.sections.slice(0, 8).map((section) => (
              <a
                key={section.id}
                href={`#cat-${section.id}`}
                className="rounded-full border border-sb-border bg-white px-3 py-1.5 text-xs font-semibold text-sb-ink hover:border-sb-orange"
              >
                {section.name.split(/[–-]/)[0].trim()}
              </a>
            ))}
          </div>
          {activePackage.sections.map((section) => (
            <Card key={section.id} id={`cat-${section.id}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sb-ink">{section.name}</h3>
                <StatusBadge tone={statusTone(section.status)}>
                  {section.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[12px] border border-sb-border p-3"
                  >
                    <p className="font-medium text-sb-ink">{item.label}</p>
                    <p className="text-xs text-sb-muted">
                      {item.vendor || "Vendor TBA"}
                    </p>
                    <p className="mt-2 text-sm font-semibold">
                      {formatCurrency(item.unitCost ?? item.selectedCost)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-sb-muted">
                      {item.optionValue || item.notes || "No specification"}
                    </p>
                  </div>
                ))}
              </div>
              {section.status !== SelectionSectionStatus.LOCKED ? (
                <form
                  action={addSelectionItemAction}
                  className="mt-4 grid gap-3 border-t border-sb-border pt-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <input type="hidden" name="sectionId" value={section.id} />
                  <FormField label="Add item" required>
                    <Input name="label" required placeholder="Product name" />
                  </FormField>
                  <FormField label="Specification">
                    <Input name="specification" />
                  </FormField>
                  <FormField label="Unit cost">
                    <Input name="unitCost" type="number" min="0" step="0.01" />
                  </FormField>
                  <div className="flex items-end">
                    <Button type="submit" size="sm">
                      Add to List
                    </Button>
                  </div>
                </form>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
