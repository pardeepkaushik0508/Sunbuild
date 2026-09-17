import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { revalidateJobsSurfaces } from "@/lib/jobs/revalidate-jobs";
import { revalidateProjectPhotos } from "@/lib/photos/revalidate";
import { collectUploadFiles } from "@/lib/media/collect-upload-files";
import { deleteUpload, saveCompanyUpload } from "@/lib/storage";
import type { AppSession } from "@/lib/session";
import {
  MAX_HERO_IMAGES,
  projectHeroImageUrls,
} from "@/lib/projects/hero-image-shared";

export {
  MAX_HERO_IMAGES,
  heroSquareGridClass,
  projectHeroImageUrls,
} from "@/lib/projects/hero-image-shared";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function getHeroImageFiles(form: FormData): File[] {
  return collectUploadFiles(form, ["heroImage", "heroImages", "images"]).slice(
    0,
    MAX_HERO_IMAGES
  );
}

/** @deprecated use getHeroImageFiles — kept for call sites that expect one file */
export function getHeroImageFile(form: FormData): File | null {
  return getHeroImageFiles(form)[0] ?? null;
}

function syncLegacyHeroField(urls: string[]) {
  return {
    heroImageUrls: urls,
    heroImageUrl: urls[0] ?? null,
  };
}

function assertHeroImageFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  if (mime && !mime.startsWith("image/")) {
    throw new AppError("Please upload an image (JPG, PNG, or WebP).");
  }
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (ext && !IMAGE_EXTS.has(ext)) {
    throw new AppError("Please upload an image (JPG, PNG, or WebP).");
  }
}

export async function saveProjectHeroImages(opts: {
  session: AppSession;
  projectId: string;
  files: File[];
  /** When true, replace existing images instead of appending. */
  replace?: boolean;
}) {
  const { session, projectId, files, replace = false } = opts;
  if (files.length === 0) {
    throw new AppError("Please select at least one house mockup image.");
  }
  for (const file of files) assertHeroImageFile(file);

  const previous = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.membership.companyId },
    select: { heroImageUrl: true, heroImageUrls: true },
  });
  if (!previous) throw new AppError("Project not found");

  const existing = replace ? [] : projectHeroImageUrls(previous);
  const remainingSlots = Math.max(0, MAX_HERO_IMAGES - existing.length);
  if (remainingSlots <= 0) {
    throw new AppError(
      `You can upload up to ${MAX_HERO_IMAGES} banner images. Remove some first.`
    );
  }

  const toUpload = files.slice(0, remainingSlots);
  const uploaded: string[] = [];
  for (const file of toUpload) {
    const saved = await saveCompanyUpload(
      session.membership.companyId,
      file,
      `heroes/${projectId}`
    );
    uploaded.push(saved.filePath);
  }

  const next = [...existing, ...uploaded];
  await prisma.project.update({
    where: { id: projectId },
    data: syncLegacyHeroField(next),
  });

  if (replace) {
    const removed = projectHeroImageUrls(previous).filter(
      (url) => !next.includes(url)
    );
    for (const url of removed) {
      try {
        await deleteUpload(url, { resourceType: "image" });
      } catch {
        // best-effort cleanup
      }
    }
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "PROJECT_HERO_UPDATED",
    entityType: "Project",
    entityId: projectId,
    metadata: { added: uploaded.length, total: next.length },
  });

  revalidateProjectPhotos(projectId);
  revalidateJobsSurfaces(projectId);
  return { urls: next, added: uploaded };
}

/** Single-file helper used by older call sites — appends one image. */
export async function saveProjectHeroImage(opts: {
  session: AppSession;
  projectId: string;
  file: File;
}) {
  return saveProjectHeroImages({
    session: opts.session,
    projectId: opts.projectId,
    files: [opts.file],
  });
}

export async function removeProjectHeroImage(opts: {
  session: AppSession;
  projectId: string;
  imageUrl: string;
}) {
  const { session, projectId, imageUrl } = opts;
  if (!imageUrl) throw new AppError("Image is required.");

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.membership.companyId },
    select: { heroImageUrl: true, heroImageUrls: true },
  });
  if (!project) throw new AppError("Project not found");

  const current = projectHeroImageUrls(project);
  if (!current.includes(imageUrl)) {
    throw new AppError("Image not found on this project.");
  }

  const next = current.filter((url) => url !== imageUrl);
  await prisma.project.update({
    where: { id: projectId },
    data: syncLegacyHeroField(next),
  });

  try {
    await deleteUpload(imageUrl, { resourceType: "image" });
  } catch {
    // file may already be gone
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "PROJECT_HERO_REMOVED",
    entityType: "Project",
    entityId: projectId,
    metadata: { removed: imageUrl, remaining: next.length },
  });

  revalidateProjectPhotos(projectId);
  revalidateJobsSurfaces(projectId);
}

export async function clearProjectHeroImage(opts: {
  session: AppSession;
  projectId: string;
}) {
  const { session, projectId } = opts;
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.membership.companyId },
    select: { heroImageUrl: true, heroImageUrls: true },
  });
  if (!project) throw new AppError("Project not found");

  const urls = projectHeroImageUrls(project);
  for (const url of urls) {
    try {
      await deleteUpload(url, { resourceType: "image" });
    } catch {
      // file may already be gone
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: syncLegacyHeroField([]),
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "PROJECT_HERO_REMOVED",
    entityType: "Project",
    entityId: projectId,
    metadata: { cleared: urls.length },
  });

  revalidateProjectPhotos(projectId);
  revalidateJobsSurfaces(projectId);
}
