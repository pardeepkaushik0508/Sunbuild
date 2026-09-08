import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import { AppError } from "@/lib/errors";
import { DEFAULT_FILE_STORAGE } from "@/lib/settings/defaults";
import type { FileStorageSettings } from "@/lib/settings/types";

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
    /^[a-zA-Z]:/.test(normalized)
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
    throw new AppError(`File too large (max ${Math.floor(max / (1024 * 1024))}MB)`);
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

export async function ensureUploadDir(...segments: string[]) {
  const safe = segments.map((s) =>
    s.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.\./g, "")
  );
  const dir = path.join(getUploadRoot(), ...safe);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveUpload(
  file: File,
  folder: string,
  storage?: Pick<FileStorageSettings, "maxUploadBytes" | "allowedExtensions">
): Promise<{ filePath: string; fileName: string; size: number }> {
  validateUploadFile(file, {
    maxBytes: storage?.maxUploadBytes,
    allowedExtensions: storage?.allowedExtensions,
  });
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeFolder = sanitizeFolder(folder);
  const safeName = sanitizeOriginalName(file.name);
  const storedName = `${nanoid(16)}_${safeName}`;
  const dir = await ensureUploadDir(...safeFolder.split("/"));
  const absolute = path.join(dir, storedName);
  assertSafeRelativePath(path.join(safeFolder, storedName));
  await writeFile(absolute, bytes);
  return {
    filePath: path.join(safeFolder, storedName).replace(/\\/g, "/"),
    fileName: path.basename(file.name).slice(0, 200),
    size: bytes.length,
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

export async function readUpload(filePath: string) {
  const { absolute } = assertSafeRelativePath(filePath);
  return readFile(absolute);
}

export async function deleteUpload(filePath: string) {
  try {
    const { absolute } = assertSafeRelativePath(filePath);
    await unlink(absolute);
  } catch {
    // ignore missing files
  }
}

export function absoluteUploadPath(filePath: string) {
  const { absolute } = assertSafeRelativePath(filePath);
  return absolute;
}

export { MAX_UPLOAD_BYTES, DEFAULT_ALLOWED_EXTENSIONS as ALLOWED_EXTENSIONS };
