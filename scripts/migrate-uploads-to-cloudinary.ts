/**
 * One-time, idempotent migration: local `uploads/` files → Cloudinary.
 *
 * Usage (from repo root, with DATABASE_URL + CLOUDINARY_URL set):
 *   npx tsx scripts/migrate-uploads-to-cloudinary.ts
 *
 * Safe to re-run: skips rows that already have storageProvider=CLOUDINARY
 * or an https://res.cloudinary.com URL. Does not delete local files.
 * Does not run automatically on deploy.
 */
import { readFile, access } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  isCloudinaryConfigured,
  isCloudinaryUrl,
  uploadBufferToCloudinary,
} from "../src/lib/cloudinary";

const prisma = new PrismaClient();

type Target = {
  label: string;
  id: string;
  filePath: string;
  folder: string;
  update: (data: {
    filePath: string;
    storageProvider: string;
    storagePublicId: string;
    mediaWidth: number | null;
    mediaHeight: number | null;
    mediaFormat: string | null;
    mediaBytes: number | null;
    mediaResourceType: string | null;
  }) => Promise<unknown>;
};

function uploadRoot() {
  return path.join(process.cwd(), "uploads");
}

async function localExists(rel: string) {
  try {
    await access(path.join(uploadRoot(), rel));
    return true;
  } catch {
    return false;
  }
}

function alreadyMigrated(filePath: string, provider?: string | null) {
  return provider === "CLOUDINARY" || isCloudinaryUrl(filePath);
}

async function migrateOne(t: Target) {
  if (!(await localExists(t.filePath))) {
    console.warn(`[skip missing] ${t.label} ${t.id} → ${t.filePath}`);
    return "missing";
  }
  const absolute = path.join(uploadRoot(), t.filePath);
  const buffer = await readFile(absolute);
  const asset = await uploadBufferToCloudinary({
    buffer,
    folder: t.folder,
    originalFilename: path.basename(t.filePath),
  });
  await t.update({
    filePath: asset.secureUrl,
    storageProvider: "CLOUDINARY",
    storagePublicId: asset.publicId,
    mediaWidth: asset.width,
    mediaHeight: asset.height,
    mediaFormat: asset.format,
    mediaBytes: asset.bytes,
    mediaResourceType: asset.resourceType,
  });
  console.log(`[ok] ${t.label} ${t.id}`);
  return "ok";
}

async function main() {
  if (!isCloudinaryConfigured()) {
    throw new Error("CLOUDINARY_URL is required");
  }

  const stats = { ok: 0, skipped: 0, missing: 0, failed: 0 };

  const photos = await prisma.photo.findMany({
    select: {
      id: true,
      projectId: true,
      filePath: true,
      storageProvider: true,
    },
  });
  for (const row of photos) {
    if (alreadyMigrated(row.filePath, row.storageProvider)) {
      stats.skipped++;
      continue;
    }
    try {
      const r = await migrateOne({
        label: "Photo",
        id: row.id,
        filePath: row.filePath,
        folder: `photos/${row.projectId}`,
        update: (data) =>
          prisma.photo.update({ where: { id: row.id }, data }),
      });
      if (r === "ok") stats.ok++;
      else if (r === "missing") stats.missing++;
    } catch (e) {
      stats.failed++;
      console.error(`[fail] Photo ${row.id}`, e instanceof Error ? e.message : e);
    }
  }

  const documents = await prisma.document.findMany({
    select: {
      id: true,
      projectId: true,
      filePath: true,
      storageProvider: true,
    },
  });
  for (const row of documents) {
    if (alreadyMigrated(row.filePath, row.storageProvider)) {
      stats.skipped++;
      continue;
    }
    try {
      const r = await migrateOne({
        label: "Document",
        id: row.id,
        filePath: row.filePath,
        folder: `documents/${row.projectId}`,
        update: (data) =>
          prisma.document.update({ where: { id: row.id }, data }),
      });
      if (r === "ok") stats.ok++;
      else if (r === "missing") stats.missing++;
    } catch (e) {
      stats.failed++;
      console.error(
        `[fail] Document ${row.id}`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const warranties = await prisma.warrantyPhoto.findMany({
    select: {
      id: true,
      ticketId: true,
      filePath: true,
      storageProvider: true,
    },
  });
  for (const row of warranties) {
    if (alreadyMigrated(row.filePath, row.storageProvider)) {
      stats.skipped++;
      continue;
    }
    try {
      const r = await migrateOne({
        label: "WarrantyPhoto",
        id: row.id,
        filePath: row.filePath,
        folder: `warranty/${row.ticketId}`,
        update: (data) =>
          prisma.warrantyPhoto.update({ where: { id: row.id }, data }),
      });
      if (r === "ok") stats.ok++;
      else if (r === "missing") stats.missing++;
    } catch (e) {
      stats.failed++;
      console.error(
        `[fail] WarrantyPhoto ${row.id}`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const projects = await prisma.project.findMany({
    where: { heroImageUrl: { not: null } },
    select: { id: true, heroImageUrl: true },
  });
  for (const row of projects) {
    const filePath = row.heroImageUrl;
    if (!filePath || alreadyMigrated(filePath)) {
      stats.skipped++;
      continue;
    }
    try {
      const r = await migrateOne({
        label: "ProjectHero",
        id: row.id,
        filePath,
        folder: `heroes/${row.id}`,
        update: (data) =>
          prisma.project.update({
            where: { id: row.id },
            data: { heroImageUrl: data.filePath },
          }),
      });
      if (r === "ok") stats.ok++;
      else if (r === "missing") stats.missing++;
    } catch (e) {
      stats.failed++;
      console.error(
        `[fail] ProjectHero ${row.id}`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const users = await prisma.user.findMany({
    where: { image: { not: null } },
    select: { id: true, image: true },
  });
  for (const row of users) {
    const filePath = row.image;
    if (!filePath || alreadyMigrated(filePath)) {
      stats.skipped++;
      continue;
    }
    try {
      const r = await migrateOne({
        label: "UserAvatar",
        id: row.id,
        filePath,
        folder: `avatars/${row.id}`,
        update: (data) =>
          prisma.user.update({
            where: { id: row.id },
            data: { image: data.filePath },
          }),
      });
      if (r === "ok") stats.ok++;
      else if (r === "missing") stats.missing++;
    } catch (e) {
      stats.failed++;
      console.error(
        `[fail] UserAvatar ${row.id}`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const contracts = await prisma.purchaseContract.findMany({
    where: { filePath: { not: null } },
    select: { id: true, projectId: true, filePath: true, storageProvider: true },
  });
  for (const row of contracts) {
    const filePath = row.filePath;
    if (!filePath || alreadyMigrated(filePath, row.storageProvider)) {
      stats.skipped++;
      continue;
    }
    try {
      const r = await migrateOne({
        label: "PurchaseContract",
        id: row.id,
        filePath,
        folder: row.projectId ? `contracts/${row.projectId}` : "contracts",
        update: (data) =>
          prisma.purchaseContract.update({
            where: { id: row.id },
            data: {
              filePath: data.filePath,
              storageProvider: data.storageProvider,
              storagePublicId: data.storagePublicId,
              mediaWidth: data.mediaWidth,
              mediaHeight: data.mediaHeight,
              mediaFormat: data.mediaFormat,
              mediaBytes: data.mediaBytes,
              mediaResourceType: data.mediaResourceType,
            },
          }),
      });
      if (r === "ok") stats.ok++;
      else if (r === "missing") stats.missing++;
    } catch (e) {
      stats.failed++;
      console.error(
        `[fail] PurchaseContract ${row.id}`,
        e instanceof Error ? e.message : e
      );
    }
  }

  console.log("Migration complete:", stats);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
