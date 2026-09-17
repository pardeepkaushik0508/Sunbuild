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
let configuredFrom: string | null = null;

function stripWrappingQuotes(raw: string): string {
  let url = raw.trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }
  return url;
}

/**
 * Normalize CLOUDINARY_URL from env.
 * Common copy/paste wraps api_key/api_secret in <> which Cloudinary rejects as Invalid api_key.
 */
export function normalizeCloudinaryUrl(raw: string): string {
  let url = stripWrappingQuotes(raw);
  if (!url) return url;

  // Accidental paste: CLOUDINARY_URL=cloudinary://... or doubled CLOUDINARY_URL=CLOUDINARY_URL=...
  while (/^CLOUDINARY_URL=/i.test(url)) {
    url = url.replace(/^CLOUDINARY_URL=/i, "").trim();
  }
  url = stripWrappingQuotes(url);

  // cloudinary://<key>:<secret>@cloud → strip accidental angle brackets
  url = url.replace(
    /^cloudinary:\/\/<?([^:>\s]+)>?:<?([^@>\s]+)>?@(.+)$/i,
    "cloudinary://$1:$2@$3"
  );
  // Also handle already-encoded brackets from bad env parsers
  url = url.replace(/%3C/gi, "").replace(/%3E/gi, "");
  return url;
}

/** Parse cloudinary://API_KEY:API_SECRET@CLOUD_NAME into SDK config fields. */
export function parseCloudinaryUrl(raw: string): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
} {
  const url = normalizeCloudinaryUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(
      "File storage configuration is invalid. Check CLOUDINARY_URL format.",
      503,
      "STORAGE_MISCONFIGURED"
    );
  }

  if (parsed.protocol !== "cloudinary:") {
    throw new AppError(
      "CLOUDINARY_URL must start with cloudinary://API_KEY:API_SECRET@CLOUD_NAME",
      503,
      "STORAGE_MISCONFIGURED"
    );
  }

  const cloud_name = parsed.hostname;
  const api_key = decodeURIComponent(parsed.username || "");
  const api_secret = decodeURIComponent(parsed.password || "");

  if (!cloud_name || !api_key || !api_secret) {
    throw new AppError(
      "CLOUDINARY_URL is missing cloud name, API key, or API secret.",
      503,
      "STORAGE_MISCONFIGURED"
    );
  }

  if (/[<>]/.test(api_key) || /[<>]/.test(api_secret)) {
    throw new AppError(
      "File storage configuration is invalid. Remove < > from CLOUDINARY_URL credentials.",
      503,
      "STORAGE_MISCONFIGURED"
    );
  }

  return { cloud_name, api_key, api_secret };
}

export type CloudinaryCredentialSource = "url" | "discrete";

function readDiscreteCloudinaryCredentials(): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
} | null {
  const cloud_name = stripWrappingQuotes(
    process.env.CLOUDINARY_CLOUD_NAME || ""
  );
  const api_key = stripWrappingQuotes(process.env.CLOUDINARY_API_KEY || "");
  const api_secret = stripWrappingQuotes(
    process.env.CLOUDINARY_API_SECRET || ""
  );
  if (!cloud_name || !api_key || !api_secret) return null;
  if (/[<>]/.test(api_key) || /[<>]/.test(api_secret)) {
    throw new AppError(
      "File storage configuration is invalid. Remove < > from Cloudinary credentials.",
      503,
      "STORAGE_MISCONFIGURED"
    );
  }
  return { cloud_name, api_key, api_secret };
}

/**
 * Prefer CLOUDINARY_URL (canonical on Render). Fall back to discrete dashboard
 * fields. If both are set and disagree, URL wins and we log a warning — stale
 * CLOUDINARY_API_* leftovers on Render used to silently override a correct URL.
 */
export function readCloudinaryCredentials(): {
  cloud_name: string;
  api_key: string;
  api_secret: string;
  source: CloudinaryCredentialSource;
} | null {
  const raw = process.env.CLOUDINARY_URL?.trim();
  const fromUrl = raw ? parseCloudinaryUrl(raw) : null;
  const fromDiscrete = readDiscreteCloudinaryCredentials();

  if (fromUrl && fromDiscrete) {
    const mismatch =
      fromUrl.cloud_name !== fromDiscrete.cloud_name ||
      fromUrl.api_key !== fromDiscrete.api_key ||
      fromUrl.api_secret !== fromDiscrete.api_secret;
    if (mismatch) {
      console.warn(
        "[cloudinary] CLOUDINARY_URL and CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET disagree; using CLOUDINARY_URL. Remove the discrete vars on Render if unused.",
        {
          urlCloud: fromUrl.cloud_name,
          discreteCloud: fromDiscrete.cloud_name,
          urlKeyHint: maskApiKey(fromUrl.api_key),
          discreteKeyHint: maskApiKey(fromDiscrete.api_key),
        }
      );
    }
    return { ...fromUrl, source: "url" };
  }

  if (fromUrl) return { ...fromUrl, source: "url" };
  if (fromDiscrete) return { ...fromDiscrete, source: "discrete" };
  return null;
}

/** Safe for Settings UI / logs — never includes the secret. */
export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (key.length <= 4) return "••••";
  return `…${key.slice(-4)}`;
}

export function getCloudinaryPublicInfo(): {
  configured: boolean;
  cloudName: string | null;
  apiKeyHint: string | null;
  source: CloudinaryCredentialSource | null;
} {
  try {
    const creds = readCloudinaryCredentials();
    if (!creds) {
      return {
        configured: false,
        cloudName: null,
        apiKeyHint: null,
        source: null,
      };
    }
    return {
      configured: true,
      cloudName: creds.cloud_name,
      apiKeyHint: maskApiKey(creds.api_key),
      source: creds.source,
    };
  } catch {
    return {
      configured: false,
      cloudName: null,
      apiKeyHint: null,
      source: null,
    };
  }
}

function credentialsCacheKey(creds: {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}) {
  return `${creds.cloud_name}:${creds.api_key}:${creds.api_secret.length}`;
}

/** Configure from env once. Never log the secret. */
export function getCloudinary() {
  let creds: {
    cloud_name: string;
    api_key: string;
    api_secret: string;
    source: CloudinaryCredentialSource;
  };
  try {
    const parsed = readCloudinaryCredentials();
    if (!parsed) {
      throw new AppError(
        "File storage is not configured. Set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET) on the server.",
        503,
        "STORAGE_NOT_CONFIGURED"
      );
    }
    creds = parsed;
  } catch (err) {
    configured = false;
    configuredFrom = null;
    throw err;
  }

  const cacheKey = credentialsCacheKey(creds);

  // Reconfigure when env changes (tests / hot reload).
  if (!configured || configuredFrom !== cacheKey) {
    // Keep env + SDK in sync so a later config(true) reset does not re-parse a
    // quoted/stale URL. Explicit fields below are the source of truth for calls.
    process.env.CLOUDINARY_URL = `cloudinary://${encodeURIComponent(creds.api_key)}:${encodeURIComponent(creds.api_secret)}@${creds.cloud_name}`;
    // Reset then set so leftover SDK state cannot keep a bad secret.
    cloudinary.config(true);
    cloudinary.config({
      cloud_name: creds.cloud_name,
      api_key: creds.api_key,
      api_secret: creds.api_secret,
      secure: true,
    });
    configured = true;
    configuredFrom = cacheKey;
    console.info("[cloudinary] configured", {
      cloudName: creds.cloud_name,
      apiKeyHint: maskApiKey(creds.api_key),
      source: creds.source,
    });
  }

  return cloudinary;
}

/** Live credential check. Parse-only `isCloudinaryConfigured` can still be a bad secret. */
export async function pingCloudinary(timeoutMs = 5000): Promise<boolean> {
  try {
    const api = getCloudinary();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    try {
      await Promise.race([api.api.ping(), timeout]);
      return true;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export function isCloudinaryConfigured(): boolean {
  try {
    return readCloudinaryCredentials() !== null;
  } catch {
    return false;
  }
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

  const selections = cleaned.match(/^selections\/([^/]+)$/);
  if (selections) return `${root}/projects/${selections[1]}/selections`;

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

/** Cloudinary SDK often rejects with plain `{ message, http_code }` objects. */
function cloudinaryErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; error?: { message?: unknown } };
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error?.message === "string" && o.error.message.trim()) {
      return o.error.message;
    }
  }
  if (typeof err === "string" && err.trim()) return err;
  return "unknown";
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
    const message = cloudinaryErrorMessage(err);
    const httpCode =
      err && typeof err === "object" && "http_code" in err
        ? Number((err as { http_code?: number }).http_code)
        : undefined;
    console.error("[cloudinary] upload failed", {
      folder,
      message,
      httpCode,
    });
    if (
      httpCode === 401 ||
      /invalid signature|invalid api_key|unauthorized|api_secret mismatch|api_secret/i.test(
        message
      )
    ) {
      const info = getCloudinaryPublicInfo();
      const where =
        info.cloudName && info.apiKeyHint
          ? ` (cloud "${info.cloudName}", API key ${info.apiKeyHint})`
          : "";
      throw new AppError(
        `Cloudinary credentials are invalid (api_secret mismatch)${where}. The API key exists but the secret does not match — regenerate API Key + Secret in Cloudinary Dashboard → Settings → API Keys, put the same CLOUDINARY_URL in .env.local and Render Environment, remove any leftover CLOUDINARY_API_* vars, then restart both.`,
        502,
        "STORAGE_AUTH_FAILED"
      );
    }
    throw new AppError(
      "Failed to upload file to storage. Check Cloudinary configuration and server logs.",
      502,
      "STORAGE_UPLOAD_FAILED"
    );
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
