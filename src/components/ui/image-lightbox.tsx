"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn, mediaUrl } from "@/lib/utils";

export type LightboxImage = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
  meta?: string | null;
};

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange?: (next: number) => void;
}) {
  const titleId = useId();
  const current = images[index];
  const href = current ? mediaUrl(current.src) : null;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const hasMany = images.length > 1;
  const loaded = Boolean(href) && loadedSrc === href;

  const go = useCallback(
    (delta: number) => {
      if (!hasMany) return;
      const next = (index + delta + images.length) % images.length;
      onIndexChange?.(next);
    },
    [hasMany, images.length, index, onIndexChange]
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 dark:bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-sb-ink shadow hover:bg-white"
        aria-label="Close image viewer"
      >
        <X size={18} />
      </button>

      {hasMany ? (
        <button
          type="button"
          onClick={() => go(-1)}
          className="absolute left-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-sb-ink shadow hover:bg-white sm:left-4"
          aria-label="Previous image"
        >
          <ChevronLeft size={20} />
        </button>
      ) : null}

      {hasMany ? (
        <button
          type="button"
          onClick={() => go(1)}
          className="absolute right-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-sb-ink shadow hover:bg-white sm:right-4"
          aria-label="Next image"
        >
          <ChevronRight size={20} />
        </button>
      ) : null}

      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col items-center">
        <p id={titleId} className="sr-only">
          {current.alt || "Project photo"}
        </p>
        <div className="relative flex max-h-[78vh] w-full items-center justify-center">
          {!loaded ? (
            <div
              className="h-48 w-full max-w-xl animate-pulse rounded-[12px] bg-white/20"
              aria-hidden
            />
          ) : null}
          {href ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={href}
              src={href}
              alt={current.alt}
              className={cn(
                "max-h-[78vh] max-w-full object-contain",
                loaded ? "opacity-100" : "h-0 opacity-0"
              )}
              onLoad={() => setLoadedSrc(href)}
              onError={() => setLoadedSrc(href)}
            />
          ) : (
            <p className="rounded-lg bg-white px-4 py-3 text-sm text-sb-muted">
              Image unavailable
            </p>
          )}
        </div>
        {(current.caption || current.meta) && loaded ? (
          <div className="mt-3 max-w-2xl text-center text-sm text-white/90">
            {current.caption ? <p>{current.caption}</p> : null}
            {current.meta ? (
              <p className="mt-0.5 text-xs text-white/70">{current.meta}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ImageLightboxTrigger({
  images,
  children,
}: {
  images: LightboxImage[];
  children: (open: (index: number) => void) => React.ReactNode;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) return null;
  return (
    <>
      {children((i) => setOpenIndex(i))}
      {openIndex != null ? (
        <ImageLightbox
          images={images}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onIndexChange={setOpenIndex}
        />
      ) : null}
    </>
  );
}
