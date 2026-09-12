import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { AppError } from "@/lib/errors";

export type CloudinaryAsset = {
  publicId: string;
  url: string;
  secureUrl: string;
  resourceType: string;
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  originalFilename: string | null;
  folder: string | null;
};

let configured = false;

function maskCloudinaryUrl(raw: string) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//***:***@${u.hostname}${u.pathname ? "/…" : ""}`;
  } catch {
    return "[invalid CLOUDINARY_URL]";
  }
}

/** Configure from CLOUDINARY_URL once. Never log the secret. */
export function getCloudinary() {
  const url = process.env.CLOUDINARY_URL?.trim();
  if (!url) {
    throw new AppError(
      "File storage is not configured. Set CLOUDINARY_URL on the server.",
      503,
      "STORAGE_NOT_CONFIGURED"
    );
  }

  if (!configured) {
    try {
      cloudinary.config({ cloudinary_url: url, secure: true });
      const cfg = cloudinary.config();
      if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) {
        throw new Error("incomplete");
      }
      configured = true;
    } catch {
      console.error(
        "[cloudinary] Invalid CLOUDINARY_URL",
        maskCloudinaryUrl(url)
      );
      throw new AppError(
        "File storage configuration is invalid. Check CLOUDINARY_URL.",
        503,
        "STORAGE_MISCONFIGURED"
      );
    }
  }

  return cloudinary;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_URL?.trim());
}

export function cloudinaryRootFolder() {
  const raw = process.env.CLOUDINARY_FOLDER?.trim() || "sunbuild";
  return raw.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9/_-]/g, "_") || "sunbuild";
}

/** Map app folder segments into a stable Cloudinary folder (IDs only). */
export function toCloudinaryFolder(appFolder: string) {
  const cleaned = appFolder
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => s.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join("/");
  const root = cloudinaryRootFolder();
  if (!cleaned) return root;

  // Normalize legacy folder names into predictable tree
  // photos/{projectId} → projects/{projectId}/photos
  const photos = cleaned.match(/^photos\/([^/]+)$/);
  if (photos) return `${root}/projects/${photos[1]}/photos`;

  const docs = cleaned.match(/^documents\/([^/]+)$/);
  if (docs) return `${root}/projects/${docs[1]}/documents`;

  const invoices = cleaned.match(/^invoices\/([^/]+)$/);
  if (invoices) return `${root}/projects/${invoices[1]}/invoices`;

  const completion = cleaned.match(/^completion\/([^/]+)$/);
  if (completion) return `${root}/projects/${completion[1]}/completion`;

  const materials = cleaned.match(/^materials\/([^/]+)$/);
  if (materials) return `${root}/projects/${materials[1]}/documents`;

  const warranty = cleaned.match(/^warranty\/([^/]+)$/);
  if (warranty) return `${root}/projects/warranty/${warranty[1]}`;

  const daily = cleaned.match(/^daily-logs\/([^/]+)(?:\/([^/]+))?$/);
  if (daily) {
    const projectId = daily[1];
    const logId = daily[2];
    return logId
      ? `${root}/projects/${projectId}/daily-logs/${logId}`
      : `${root}/projects/${projectId}/daily-logs`;
  }

  const avatars = cleaned.match(/^avatars\/([^/]+)$/);
  if (avatars) return `${root}/users/${avatars[1]}/avatars`;

  const contracts = cleaned.match(/^contracts(?:\/([^/]+))?$/);
  if (contracts) {
    return contracts[1]
      ? `${root}/projects/${contracts[1]}/documents`
      : `${root}/contracts`;
  }

  return `${root}/${cleaned}`;
}

function toAsset(result: UploadApiResponse): CloudinaryAsset {
  const secureUrl = result.secure_url || result.url?.replace(/^http:/, "https:");
  if (!secureUrl || !result.public_id) {
    throw new AppError("Cloudinary upload returned an incomplete response");
  }
  return {
    publicId: result.public_id,
    url: secureUrl,
    secureUrl,
    resourceType: result.resource_type || "raw",
    format: result.format ?? null,
    width: typeof result.width === "number" ? result.width : null,
    height: typeof result.height === "number" ? result.height : null,
    bytes: typeof result.bytes === "number" ? result.bytes : null,
    originalFilename: result.original_filename ?? null,
    folder: result.folder ?? null,
  };
}

export async function uploadBufferToCloudinary(opts: {
  buffer: Buffer;
  folder: string;
  originalFilename: string;
  mimeType?: string;
}): Promise<CloudinaryAsset> {
  const api = getCloudinary();
  const folder = toCloudinaryFolder(opts.folder);
  const isImage = (opts.mimeType || "").startsWith("image/");

  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = api.uploader.upload_stream(
        {
          folder,
          resource_type: isImage ? "image" : "auto",
          use_filename: true,
          unique_filename: true,
          overwrite: false,
          filename_override: opts.originalFilename.slice(0, 120),
        },
        (error, res) => {
          if (error || !res) reject(error ?? new Error("Empty Cloudinary response"));
          else resolve(res);
        }
      );
      stream.end(opts.buffer);
    });
    return toAsset(result);
  } catch (err) {
    console.error("[cloudinary] upload failed", {
      folder,
      message: err instanceof Error ? err.message : "unknown",
    });
    throw new AppError("Failed to upload file to storage", 502, "STORAGE_UPLOAD_FAILED");
  }
}

export async function destroyCloudinaryAsset(
  publicId: string,
  resourceType: string = "image"
): Promise<void> {
  if (!publicId) return;
  const api = getCloudinary();
  try {
    await api.uploader.destroy(publicId, {
      resource_type: resourceType === "image" || resourceType === "video" || resourceType === "raw"
        ? resourceType
        : "image",
      invalidate: true,
    });
  } catch (err) {
    console.error("[cloudinary] destroy failed", {
      publicId,
      message: err instanceof Error ? err.message : "unknown",
    });
    throw new AppError("Failed to delete file from storage", 502, "STORAGE_DELETE_FAILED");
  }
}

/** Optimized delivery URL for thumbnails (does not alter the original asset). */
export function cloudinaryThumbnailUrl(
  secureUrlOrPublicId: string,
  opts?: { width?: number; height?: number }
): string {
  const width = opts?.width ?? 480;
  const height = opts?.height ?? 320;
  const transform = `c_fill,f_auto,q_auto,w_${width},h_${height}`;

  if (secureUrlOrPublicId.includes("/upload/")) {
    return secureUrlOrPublicId.replace("/upload/", `/upload/${transform}/`);
  }

  if (!isCloudinaryConfigured()) return secureUrlOrPublicId;
  try {
    const api = getCloudinary();
    return api.url(secureUrlOrPublicId, {
      secure: true,
      transformation: [{ crop: "fill", fetch_format: "auto", quality: "auto", width, height }],
    });
  } catch {
    return secureUrlOrPublicId;
  }
}

export function isCloudinaryUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.endsWith("cloudinary.com");
  } catch {
    return false;
  }
}
