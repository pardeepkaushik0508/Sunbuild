import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function fullName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(" ") || "—";
}

export function whatsappLink(phone?: string | null, text?: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${q}`;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Legacy seed paths → public placeholders (no /api/files, works on Render). */
const LEGACY_SEED_MEDIA: Record<string, string> = {
  "seed/placeholder.txt": "/placeholders/site-progress.svg",
  "seed/placeholder-client.txt": "/placeholders/client-update.svg",
  "seed/schedule.txt": "/placeholders/schedule.txt",
  "seed/costs.txt": "/placeholders/costs.txt",
};

/** Resolve a stored upload path or absolute URL for use in <img src> / downloads. */
export function mediaUrl(path?: string | null) {
  if (!path) return null;
  const legacy = LEGACY_SEED_MEDIA[path];
  if (legacy) return legacy;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("/")
  ) {
    // Prefer HTTPS for Cloudinary (and reject insecure http image hosts in UI).
    if (path.startsWith("http://res.cloudinary.com/")) {
      return `https://${path.slice("http://".length)}`;
    }
    return path;
  }
  return `/api/files/${path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}

/** Thumbnail delivery URL — Cloudinary f_auto/q_auto when applicable. */
export function mediaThumbnailUrl(
  path?: string | null,
  opts?: { width?: number; height?: number }
) {
  const url = mediaUrl(path);
  if (!url) return null;
  const width = opts?.width ?? 480;
  const height = opts?.height ?? 320;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace(
      "/upload/",
      `/upload/c_fill,f_auto,q_auto,w_${width},h_${height}/`
    );
  }
  return url;
}

export function isImageFileName(name?: string | null) {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

/** Relative activity labels for user list (e.g. "2 hours ago", "Yesterday"). */
export function formatRelativeTime(date: Date | string | null | undefined) {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "Never";

  const now = Date.now();
  const diffMs = now - d.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return "Just now";
  if (abs < hour) {
    const n = Math.floor(abs / minute);
    return `${n} minute${n === 1 ? "" : "s"} ago`;
  }
  if (abs < day) {
    const n = Math.floor(abs / hour);
    return `${n} hour${n === 1 ? "" : "s"} ago`;
  }
  if (abs < 2 * day) return "Yesterday";
  if (abs < 7 * day) {
    const n = Math.floor(abs / day);
    return `${n} day${n === 1 ? "" : "s"} ago`;
  }
  return formatDate(d);
}

/** Currency rounding helper — avoids floating point arithmetic drift. */
export function roundMoney(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
