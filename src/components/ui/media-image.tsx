"use client";

import { useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn, isImageFileName, mediaThumbnailUrl, mediaUrl } from "@/lib/utils";

type MediaImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  /** Use Cloudinary thumbnail transform when possible. */
  thumbnail?: boolean;
  width?: number;
  height?: number;
  /** Stable aspect box — avoids layout jump while loading. */
  aspectClassName?: string;
  /** How the image fills the box. Default cover. */
  objectFit?: "cover" | "contain";
  /** Hint browser to prioritize first paints (hero tiles). */
  priority?: boolean;
};

/**
 * Image with skeleton loading + fallback. Does not crash on broken assets.
 * Cached images are marked ready via img.complete (onLoad alone can miss).
 */
export function MediaImage({
  src,
  alt,
  className,
  thumbnail = true,
  width = 480,
  height = 320,
  aspectClassName = "aspect-video",
  objectFit = "cover",
  priority = false,
}: MediaImageProps) {
  const crop = objectFit === "contain" ? "fit" : "fill";
  const primary = thumbnail
    ? mediaThumbnailUrl(src, { width, height, crop })
    : mediaUrl(src);
  const bundled =
    src &&
    !src.startsWith("http") &&
    !src.startsWith("/") &&
    !src.startsWith("data:") &&
    isImageFileName(src)
      ? `/legacy-media/${src
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/")}`
      : null;
  const [bundledFor, setBundledFor] = useState<string | null>(null);
  const useBundled = Boolean(src && bundledFor === src);
  const resolved =
    useBundled && bundled && bundled !== primary ? bundled : primary;
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const failed = !resolved || failedFor === resolved;
  const ready = Boolean(resolved) && loadedFor === resolved;

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-sb-canvas text-sb-muted",
          aspectClassName,
          className
        )}
        role="img"
        aria-label={alt || "Image unavailable"}
      >
        <div className="flex flex-col items-center gap-1 px-3 text-center">
          <ImageOff size={22} aria-hidden />
          <span className="text-[11px]">Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-sb-canvas", aspectClassName, className)}>
      {!ready ? (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-sb-canvas via-sb-border/40 to-sb-canvas"
          aria-hidden
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        key={resolved}
        src={resolved!}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        width={width}
        height={height}
        className={cn(
          "h-full w-full transition-opacity duration-150",
          objectFit === "contain" ? "object-contain" : "object-cover",
          ready ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setLoadedFor(resolved)}
        onError={() => {
          if (!useBundled && bundled && bundled !== resolved) {
            setBundledFor(src ?? null);
            return;
          }
          setFailedFor(resolved);
        }}
      />
    </div>
  );
}
