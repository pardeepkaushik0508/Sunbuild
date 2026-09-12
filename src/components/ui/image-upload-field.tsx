"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreviewFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type ImageUploadFieldProps = {
  /** Form field name — use photos for multiple, file for single. */
  name?: string;
  multiple?: boolean;
  accept?: string;
  maxFiles?: number;
  label?: string;
  className?: string;
  required?: boolean;
};

/**
 * Immediate local previews via createObjectURL with proper revoke cleanup.
 * Files stay in the FormData input for the server action upload.
 */
export function ImageUploadField({
  name = "file",
  multiple = false,
  accept = "image/jpeg,image/png,image/webp,image/gif",
  maxFiles = 10,
  label,
  className,
  required = false,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PreviewFile[]>([]);

  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  function syncInputFiles(next: PreviewFile[]) {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const p of next) dt.items.add(p.file);
    input.files = dt.files;
  }

  function onSelect(files: FileList | null) {
    if (!files?.length) return;
    const incoming = Array.from(files).filter((f) => f.size > 0);
    setPreviews((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      const limited = (multiple ? incoming : incoming.slice(0, 1)).slice(
        0,
        maxFiles
      );
      const next = limited.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      queueMicrotask(() => syncInputFiles(next));
      return next;
    });
  }

  function removeAt(id: string) {
    setPreviews((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((p) => p.id !== id);
      queueMicrotask(() => syncInputFiles(next));
      return next;
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-sb-ink">
          {label}
          {required ? <span className="text-sb-orange"> *</span> : null}
        </label>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required && previews.length === 0}
        className="block w-full text-sm text-sb-muted file:mr-3 file:rounded-[8px] file:border-0 file:bg-sb-canvas file:px-3 file:py-2 file:text-sm file:font-medium file:text-sb-ink hover:file:bg-sb-border/40"
        onChange={(e) => onSelect(e.target.files)}
      />

      {previews.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((p) => (
            <li
              key={p.id}
              className="relative overflow-hidden rounded-[8px] border border-sb-border bg-sb-canvas"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt={p.file.name}
                className="aspect-video w-full object-cover"
              />
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="truncate text-[11px] text-sb-muted" title={p.file.name}>
                  {p.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(p.id)}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-sb-muted hover:bg-sb-border/50 hover:text-sb-ink"
                  aria-label={`Remove ${p.file.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
