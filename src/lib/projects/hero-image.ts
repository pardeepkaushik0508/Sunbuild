import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { revalidateJobsSurfaces } from "@/lib/jobs/revalidate-jobs";
import { revalidateProjectPhotos } from "@/lib/photos/revalidate";
import { deleteUpload, saveCompanyUpload } from "@/lib/storage";
import type { AppSession } from "@/lib/session";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function getHeroImageFile(form: FormData): File | null {
  const value = form.get("heroImage");
  if (value instanceof File && value.size > 0) return value;
  return null;
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

export async function saveProjectHeroImage(opts: {
  session: AppSession;
  projectId: string;
  file: File;
}) {
  const { session, projectId, file } = opts;
  assertHeroImageFile(file);

  const previous = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.membership.companyId },
    select: { heroImageUrl: true },
  });
  if (!previous) throw new AppError("Project not found");

  const saved = await saveCompanyUpload(
    session.membership.companyId,
    file,
    `heroes/${projectId}`
  );

  await prisma.project.update({
    where: { id: projectId },
    data: {
      heroImageUrl: saved.filePath,
    },
  });

  if (previous.heroImageUrl && previous.heroImageUrl !== saved.filePath) {
    try {
      await deleteUpload(previous.heroImageUrl, { resourceType: "image" });
    } catch {
      // best-effort cleanup
    }
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "PROJECT_HERO_UPDATED",
    entityType: "Project",
    entityId: projectId,
  });

  revalidateProjectPhotos(projectId);
  revalidateJobsSurfaces(projectId);
  return saved;
}

export async function clearProjectHeroImage(opts: {
  session: AppSession;
  projectId: string;
}) {
  const { session, projectId } = opts;
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: session.membership.companyId },
    select: { heroImageUrl: true },
  });
  if (!project) throw new AppError("Project not found");

  if (project.heroImageUrl) {
    try {
      await deleteUpload(project.heroImageUrl, { resourceType: "image" });
    } catch {
      // file may already be gone
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { heroImageUrl: null },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "PROJECT_HERO_REMOVED",
    entityType: "Project",
    entityId: projectId,
  });

  revalidateProjectPhotos(projectId);
  revalidateJobsSurfaces(projectId);
}
