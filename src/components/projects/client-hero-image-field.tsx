"use client";

import { ImageUploadField } from "@/components/ui/image-upload-field";

/** Optional house mockup collected when creating a client project/login. */
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
        Optional house mockup. It stays as the main image on the client portal.
        Later site photos appear under Project Photos — they will not replace
        this banner. You can change it anytime on the project page.
      </p>
      <ImageUploadField name="heroImage" label="House mockup image" />
    </div>
  );
}
