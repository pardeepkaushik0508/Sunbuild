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
