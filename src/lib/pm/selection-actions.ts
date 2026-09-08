"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { SelectionPackageStatus, SelectionSectionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireSession,
  assertProjectAccess,
} from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { saveCompanyUpload, deleteUpload } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import {
  ACTION_RATE,
  UPLOAD_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function rateLimit(userId: string, kind: string, upload = false) {
  const h = await headers();
  const cfg = upload ? UPLOAD_RATE : ACTION_RATE;
  assertRateLimit(
    clientKeyFromHeaders(h, `${kind}:${userId}`),
    cfg.limit,
    cfg.windowMs
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function headerIndex(headersRow: string[], aliases: string[]) {
  const normalized = headersRow.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = normalized.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function setSectionBudgetAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimit(session.user.id, "selection-budget");

  const sectionId = formString(form, "sectionId");
  const amountRaw = formString(form, "budgetAmount");
  if (!sectionId) throw new AppError("Category is required");
  if (!amountRaw) throw new AppError("Budget amount is required");
  const amount = Number(amountRaw);
  if (Number.isNaN(amount) || amount < 0) {
    throw new AppError("Budget amount must be a non-negative number");
  }

  const section = await prisma.selectionSection.findUnique({
    where: { id: sectionId },
    include: { package: true },
  });
  if (!section) throw new AppError("Category not found");
  await assertProjectAccess(session, section.package.projectId);
  if (
    section.status === SelectionSectionStatus.LOCKED ||
    section.status === SelectionSectionStatus.APPROVED
  ) {
    throw new AppError("Approved/locked categories cannot change budget");
  }

  await prisma.selectionSection.update({
    where: { id: sectionId },
    data: { allowance: amount },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: section.package.projectId,
    action: "SELECTION_BUDGET_SET",
    entityType: "SelectionSection",
    entityId: sectionId,
  });

  revalidatePath("/pm/selections");
  revalidatePath(`/pm/selections/${section.packageId}`);
  revalidatePath("/client/selections");
}

export async function createSelectionSectionAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimit(session.user.id, "selection-section");

  const packageId = formString(form, "packageId");
  const name = formString(form, "name");
  if (!packageId) throw new AppError("Package is required");
  if (!name) throw new AppError("Category name is required");

  const pkg = await prisma.selectionPackage.findUnique({
    where: { id: packageId },
  });
  if (!pkg) throw new AppError("Package not found");
  await assertProjectAccess(session, pkg.projectId);
  if (pkg.status === SelectionPackageStatus.LOCKED) {
    throw new AppError("Package is locked");
  }

  const maxSort = await prisma.selectionSection.aggregate({
    where: { packageId },
    _max: { sortOrder: true },
  });

  const dueRaw = formString(form, "dueDate");
  const priorityRaw = formString(form, "priority").toUpperCase();
  const priority =
    priorityRaw === "HIGH" || priorityRaw === "LOW" || priorityRaw === "MEDIUM"
      ? priorityRaw
      : "MEDIUM";

  const created = await prisma.selectionSection.create({
    data: {
      packageId,
      name,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      notes: formString(form, "notes") || null,
      allowance: formString(form, "budgetAmount")
        ? Number(formString(form, "budgetAmount"))
        : null,
      items: {
        create: [{ label: "Primary selection", sortOrder: 1 }],
      },
    },
  });

  // Persist dueDate/priority even if Prisma Client typings lag behind schema push
  await prisma.$executeRaw`
    UPDATE SelectionSection
    SET dueDate = ${dueRaw ? new Date(dueRaw) : null},
        priority = ${priority}
    WHERE id = ${created.id}
  `;

  revalidatePath("/pm/selections");
  revalidatePath(`/pm/selections/${packageId}`);
  revalidatePath("/client/selections");
}

export async function addSelectionItemAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimit(session.user.id, "selection-item");

  const sectionId = formString(form, "sectionId");
  const label = formString(form, "label");
  if (!sectionId) throw new AppError("Category is required");
  if (!label) throw new AppError("Item name is required");

  const section = await prisma.selectionSection.findUnique({
    where: { id: sectionId },
    include: { package: true },
  });
  if (!section) throw new AppError("Category not found");
  await assertProjectAccess(session, section.package.projectId);
  if (section.status === SelectionSectionStatus.LOCKED) {
    throw new AppError("Category is locked");
  }

  const existing = await prisma.selectionItem.findFirst({
    where: { sectionId, label: { equals: label } },
  });
  if (existing) throw new AppError("This item already exists in the category");

  const maxSort = await prisma.selectionItem.aggregate({
    where: { sectionId },
    _max: { sortOrder: true },
  });

  const unitCost = formString(form, "unitCost")
    ? Number(formString(form, "unitCost"))
    : null;
  const qtyRequired = formString(form, "qtyRequired")
    ? Number(formString(form, "qtyRequired"))
    : null;
  const qtyAllotted = formString(form, "qtyAllotted")
    ? Number(formString(form, "qtyAllotted"))
    : null;
  const selectedCost =
    unitCost != null && qtyAllotted != null ? unitCost * qtyAllotted : unitCost;

  await prisma.selectionItem.create({
    data: {
      sectionId,
      label,
      optionValue: formString(form, "specification") || null,
      notes: formString(form, "notes") || null,
      vendor: formString(form, "vendor") || null,
      unitCost,
      qtyRequired,
      qtyAllotted,
      selectedCost,
      allowanceAmount: section.allowance,
      overage:
        selectedCost != null && section.allowance != null
          ? Math.max(0, selectedCost - section.allowance)
          : null,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath("/pm/selections");
  revalidatePath(`/pm/selections/${section.packageId}`);
}

export async function uploadMaterialListAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimit(session.user.id, "material-upload", true);

  const projectId = formString(form, "projectId");
  if (!projectId) throw new AppError("Project is required");
  await assertProjectAccess(session, projectId);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("CSV or Excel file required");
  }
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (![".csv", ".txt"].includes(ext)) {
    throw new AppError("Upload a CSV file (.csv). Excel export to CSV is supported.");
  }

  const saved = await saveCompanyUpload(
    session.membership.companyId,
    file,
    `materials/${projectId}`
  );

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new AppError("File must include a header row and at least one data row");
  }

  const headersRow = rows[0];
  const idx = {
    category: headerIndex(headersRow, ["Category", "Section"]),
    item: headerIndex(headersRow, ["Item", "Items", "Name", "Product"]),
    spec: headerIndex(headersRow, ["Specification", "Specifications", "Spec"]),
    qtyReq: headerIndex(headersRow, ["Quantity Required", "Qty Required", "QtyReq"]),
    qtyAll: headerIndex(headersRow, ["Quantity Allotted", "Qty Allotted", "QtyAll"]),
    unit: headerIndex(headersRow, ["Unit Cost", "UnitCost", "Cost"]),
    total: headerIndex(headersRow, ["Total Cost", "TotalCost", "Total"]),
  };
  if (idx.category < 0 || idx.item < 0) {
    throw new AppError(
      "CSV must include Category and Item columns (optional: Specification, Quantity Required, Quantity Allotted, Unit Cost, Total Cost)"
    );
  }

  let pkg = await prisma.selectionPackage.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { sections: true },
  });
  if (!pkg) {
    pkg = await prisma.selectionPackage.create({
      data: {
        projectId,
        title: "Material Selections",
        status: SelectionPackageStatus.OPEN,
      },
      include: { sections: true },
    });
  }

  const errors: string[] = [];
  let imported = 0;
  const sectionCache = new Map(pkg.sections.map((s) => [s.name.toLowerCase(), s]));

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const category = row[idx.category]?.trim();
    const item = row[idx.item]?.trim();
    if (!category || !item) {
      errors.push(`Row ${r + 1}: Category and Item are required`);
      continue;
    }
    const unitCost =
      idx.unit >= 0 && row[idx.unit]
        ? Number(String(row[idx.unit]).replace(/[$,]/g, ""))
        : null;
    const qtyRequired =
      idx.qtyReq >= 0 && row[idx.qtyReq] ? Number(row[idx.qtyReq]) : null;
    const qtyAllotted =
      idx.qtyAll >= 0 && row[idx.qtyAll] ? Number(row[idx.qtyAll]) : null;
    const total =
      idx.total >= 0 && row[idx.total]
        ? Number(String(row[idx.total]).replace(/[$,]/g, ""))
        : unitCost != null && qtyAllotted != null
          ? unitCost * qtyAllotted
          : unitCost;

    if (
      (unitCost != null && Number.isNaN(unitCost)) ||
      (qtyRequired != null && Number.isNaN(qtyRequired)) ||
      (qtyAllotted != null && Number.isNaN(qtyAllotted)) ||
      (total != null && Number.isNaN(total))
    ) {
      errors.push(`Row ${r + 1}: invalid numeric value`);
      continue;
    }

    let section = sectionCache.get(category.toLowerCase());
    if (!section) {
      section = await prisma.selectionSection.create({
        data: {
          packageId: pkg.id,
          name: category,
          sortOrder: sectionCache.size + 1,
        },
      });
      sectionCache.set(category.toLowerCase(), section);
    }

    const dup = await prisma.selectionItem.findFirst({
      where: { sectionId: section.id, label: item },
    });
    if (dup) {
      await prisma.selectionItem.update({
        where: { id: dup.id },
        data: {
          optionValue: idx.spec >= 0 ? row[idx.spec] || null : dup.optionValue,
          qtyRequired,
          qtyAllotted,
          unitCost,
          selectedCost: total,
        },
      });
    } else {
      await prisma.selectionItem.create({
        data: {
          sectionId: section.id,
          label: item,
          optionValue: idx.spec >= 0 ? row[idx.spec] || null : null,
          qtyRequired,
          qtyAllotted,
          unitCost,
          selectedCost: total,
          sortOrder: imported + 1,
        },
      });
    }
    imported++;
  }

  if (imported === 0) {
    throw new AppError(
      errors[0] || "No valid rows imported. Check Category and Item columns."
    );
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      materialListPath: saved.filePath,
      materialListName: saved.fileName,
      materialListAt: new Date(),
    },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "MATERIAL_LIST_UPLOADED",
    entityType: "Project",
    entityId: projectId,
  });

  revalidatePath("/pm/selections");
  revalidatePath("/pm/projects");
  revalidatePath(`/pm/projects/${projectId}`);
  revalidatePath("/pm");
}

export async function removeMaterialListAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimit(session.user.id, "material-remove");

  const projectId = formString(form, "projectId");
  if (!projectId) throw new AppError("Project is required");
  await assertProjectAccess(session, projectId);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError("Project not found");

  if (project.materialListPath) {
    try {
      await deleteUpload(project.materialListPath);
    } catch {
      // file may already be gone
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      materialListPath: null,
      materialListName: null,
      materialListAt: null,
    },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "MATERIAL_LIST_REMOVED",
    entityType: "Project",
    entityId: projectId,
  });

  revalidatePath("/pm/selections");
  revalidatePath("/pm/projects");
  revalidatePath(`/pm/projects/${projectId}`);
}
