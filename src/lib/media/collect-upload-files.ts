/**
 * Collect image files from a multipart form.
 * Accepts common field names used across PM photos, sub uploads, and selections.
 */
export function collectUploadFiles(
  form: FormData,
  keys: string[] = ["file", "files", "photos", "images"]
): File[] {
  const seen = new Set<string>();
  const files: File[] = [];
  for (const key of keys) {
    for (const value of form.getAll(key)) {
      if (!(value instanceof File) || value.size === 0) continue;
      const sig = `${value.name}:${value.size}:${value.lastModified}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      files.push(value);
    }
  }
  return files;
}

export function parseClientVisibleFlag(
  raw: string | null | undefined,
  fallback = true
): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return fallback;
}
