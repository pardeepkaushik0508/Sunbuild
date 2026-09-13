import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import { AppError } from "@/lib/errors";
import { DEFAULT_FILE_STORAGE } from "@/lib/settings/defaults";
import type { FileStorageSettings } from "@/lib/settings/types";
import {
  destroyCloudinaryAsset,
  isCloudinaryConfigured,
  isCloudinaryUrl,
  uploadBufferToCloudinary,
} from "@/lib/cloudinary";

/** Fallback when company settings are not yet loaded. */
const MAX_UPLOAD_BYTES = DEFAULT_FILE_STORAGE.maxUploadBytes;

const DEFAULT_ALLOWED_EXTENSIONS = new Set(DEFAULT_FILE_STORAGE.allowedExtensions);

const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
];

export type StorageProviderName = "CLOUDINARY" | "LOCAL";

export type SavedUpload = {
  /** Render/download URL: Cloudinary secure_url, or legacy relative path. */
  filePath: string;
  fileName: string;
  size: number;
  provider: StorageProviderName;
  publicId: string | null;
  resourceType: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
};

function getUploadRoot() {
  return path.join(process.cwd(), "uploads");
}

function sanitizeFolder(folder: string) {
  const cleaned = folder
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join("/");
  if (!cleaned) throw new AppError("Invalid upload folder");
  return cleaned;
}

function sanitizeOriginalName(name: string) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120) || "file";
}

function assertSafeRelativePath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\0") ||
    path.isAbsolute(filePath) ||
    /^[a-zA-Z]:/.test(normalized) ||
    /^https?:\/\//i.test(normalized)
  ) {
    throw new AppError("Invalid file path", 400, "INVALID_PATH");
  }
  const absolute = path.resolve(getUploadRoot(), normalized);
  const root = path.resolve(getUploadRoot());
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new AppError("Invalid file path", 400, "INVALID_PATH");
  }
  return { normalized, absolute };
}

export function validateUploadFile(
  file: File,
  opts?: { maxBytes?: number; allowedExtensions?: string[] }
) {
  const max = opts?.maxBytes ?? MAX_UPLOAD_BYTES;
  const allowed = new Set(
    (opts?.allowedExtensions ?? [...DEFAULT_ALLOWED_EXTENSIONS]).map((e) =>
      e.toLowerCase()
    )
  );
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new AppError("File required");
  }
  if (file.size > max) {
    const mb = Math.floor(max / (1024 * 1024));
    throw new AppError(
      `File is too large. Maximum size is ${mb} MB.`,
      400,
      "FILE_TOO_LARGE"
    );
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!allowed.has(ext)) {
    throw new AppError("File type not allowed");
  }
  const mime = (file.type || "").toLowerCase();
  if (
    mime &&
    !ALLOWED_MIME_PREFIXES.some((p) => mime === p || mime.startsWith(p))
  ) {
    throw new AppError("File type not allowed");
  }
  return { ext, mime };
}

/** Prisma-ready media metadata from a successful upload. */
export function storageMeta(saved: SavedUpload) {
  return {
    filePath: saved.filePath,
    fileName: saved.fileName,
    storageProvider: saved.provider,
    storagePublicId: saved.publicId,
    mediaWidth: saved.width,
    mediaHeight: saved.height,
    mediaFormat: saved.format,
    mediaBytes: saved.size,
    mediaResourceType: saved.resourceType,
  };
}

export async function ensureUploadDir(...segments: string[]) {
  const safe = segments.map((s) =>
    s.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.\./g, "")
  );
  const dir = path.join(getUploadRoot(), ...safe);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Persist an upload to Cloudinary when configured.
 * Falls back to local `uploads/` when Cloudinary is missing or rejects credentials
 * (common local misconfig) so image upload/update keeps working.
 */
export async function saveUpload(
  file: File,
  folder: string,
  storage?: Pick<FileStorageSettings, "maxUploadBytes" | "allowedExtensions">
): Promise<SavedUpload> {
  const { mime } = validateUploadFile(file, {
    maxBytes: storage?.maxUploadBytes,
    allowedExtensions: storage?.allowedExtensions,
  });
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeFolder = sanitizeFolder(folder);
  const safeName = sanitizeOriginalName(file.name);
  const displayName = path.basename(file.name).slice(0, 200);

  if (isCloudinaryConfigured()) {
    try {
      const asset = await uploadBufferToCloudinary({
        buffer: bytes,
        folder: safeFolder,
        originalFilename: safeName,
        mimeType: mime || file.type,
      });

      return {
        filePath: asset.secureUrl,
        fileName: displayName,
        size: asset.bytes ?? bytes.length,
        provider: "CLOUDINARY",
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        format: asset.format,
        width: asset.width,
        height: asset.height,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      const canFallback =
        process.env.NODE_ENV !== "production" ||
        process.env.FILE_STORAGE_ALLOW_LOCAL_FALLBACK === "1";
      if (!canFallback) throw err;
      console.error(
        "[storage] Cloudinary upload failed — using local uploads fallback",
        { message }
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new AppError(
      "File storage is not configured. Set CLOUDINARY_URL on the server.",
      503,
      "STORAGE_NOT_CONFIGURED"
    );
  }

  const local = await saveLocalUploadForMigration(bytes, safeFolder, displayName);
  const ext = path.extname(displayName).replace(".", "").toLowerCase() || null;
  return {
    filePath: local.filePath,
    fileName: local.fileName,
    size: local.size,
    provider: "LOCAL",
    publicId: null,
    resourceType: (mime || "").startsWith("image/") ? "image" : "raw",
    format: ext,
    width: null,
    height: null,
  };
}

/** Persist upload using the company's File Storage settings. */
export async function saveCompanyUpload(
  companyId: string,
  file: File,
  folder: string
) {
  const { getFileStorageSettings } = await import("@/lib/settings/store");
  const storage = await getFileStorageSettings(companyId);
  return saveUpload(file, folder, storage);
}

/**
 * Read legacy local files only. Cloudinary assets are served via secure_url.
 */
export async function readUpload(filePath: string) {
  if (isCloudinaryUrl(filePath)) {
    const res = await fetch(filePath);
    if (!res.ok) {
      throw new AppError("File not found", 404, "NOT_FOUND");
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const { absolute } = assertSafeRelativePath(filePath);
  try {
    await access(/*turbopackIgnore: true*/ absolute);
  } catch {
    throw new AppError("File not found", 404, "NOT_FOUND");
  }
  return readFile(/*turbopackIgnore: true*/ absolute);
}

/**
 * Delete a stored asset. Prefer publicId for Cloudinary destroys.
 * Falls back to legacy local unlink for relative paths.
 */
export async function deleteUpload(
  filePath: string | null | undefined,
  opts?: { publicId?: string | null; resourceType?: string | null }
) {
  if (!filePath && !opts?.publicId) return;

  const publicId = opts?.publicId?.trim() || null;
  if (publicId && isCloudinaryConfigured()) {
    try {
      await destroyCloudinaryAsset(
        publicId,
        opts?.resourceType || guessResourceType(filePath)
      );
      return;
    } catch (err) {
      // Log and continue — caller may still clear DB row
      console.error("[storage] Cloudinary delete failed", {
        publicId,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  if (filePath && isCloudinaryUrl(filePath)) {
    // Without publicId we cannot safely destroy; leave orphan for cleanup tooling.
    console.error("[storage] Cloudinary delete skipped — missing publicId");
    return;
  }

  if (!filePath) return;
  try {
    const { absolute } = assertSafeRelativePath(filePath);
    await unlink(absolute);
  } catch {
    // ignore missing files
  }
}

function guessResourceType(filePath?: string | null) {
  if (!filePath) return "image";
  const lower = filePath.toLowerCase();
  if (/\.(pdf|doc|docx|xls|xlsx|csv|txt)(\?|$)/.test(lower)) return "raw";
  if (/\.(mp4|mov|webm)(\?|$)/.test(lower)) return "video";
  return "image";
}

export function absoluteUploadPath(filePath: string) {
  const { absolute } = assertSafeRelativePath(filePath);
  return absolute;
}

/** Dev-only / migration helper: write a file to local uploads (not for new product uploads). */
export async function saveLocalUploadForMigration(
  file: File | Buffer,
  folder: string,
  originalName: string
): Promise<{ filePath: string; fileName: string; size: number }> {
  const bytes = Buffer.isBuffer(file)
    ? file
    : Buffer.from(await file.arrayBuffer());
  const safeFolder = sanitizeFolder(folder);
  const safeName = sanitizeOriginalName(originalName);
  const storedName = `${nanoid(16)}_${safeName}`;
  const dir = await ensureUploadDir(...safeFolder.split("/"));
  const absolute = path.join(dir, storedName);
  assertSafeRelativePath(path.join(safeFolder, storedName));
  await writeFile(absolute, bytes);
  return {
    filePath: path.join(safeFolder, storedName).replace(/\\/g, "/"),
    fileName: path.basename(originalName).slice(0, 200),
    size: bytes.length,
  };
}

export { MAX_UPLOAD_BYTES, DEFAULT_ALLOWED_EXTENSIONS as ALLOWED_EXTENSIONS };
