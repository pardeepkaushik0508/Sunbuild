"use client";

import { ImageUploadField } from "@/components/ui/image-upload-field";
import { MAX_HERO_IMAGES } from "@/lib/projects/hero-image-shared";

/** Optional house mockups collected when creating a client project/login. */
export function ClientHeroImageField({
  className = "md:col-span-2",
}: {
  className?: string;
}) {
  return (
    <div
      className={`space-y-2 rounded-[12px] border border-sb-border bg-sb-canvas/40 p-4 ${className}`}
    >
      <p className="text-sm font-semibold text-sb-ink">Client home banner</p>
      <p className="text-xs text-sb-muted">
        Optional house mockups. They stay as the main images on the client
        portal in square tiles. Later site photos appear under Project Photos —
        they will not replace this banner. You can change them anytime on the
        project page.
      </p>
      <ImageUploadField
        name="heroImage"
        label="House mockup images"
        multiple
        maxFiles={MAX_HERO_IMAGES}
        previewSquare
        hint={`Select up to ${MAX_HERO_IMAGES} images at once (Ctrl/Cmd+click).`}
      />
    </div>
  );
}
