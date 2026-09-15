"use client";

import Link from "next/link";
import { ImageLightboxTrigger, type LightboxImage } from "@/components/ui/image-lightbox";
import { MediaImage } from "@/components/ui/media-image";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export type ProjectPhotoItem = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
  createdAt?: string | Date | null;
};

const DASHBOARD_CAP = 8;

export function ProjectPhotoGallery({
  photos,
  viewAllHref,
  title = "Project Photos",
  emptyDescription = "Photos your project manager shares will appear here.",
  cap = DASHBOARD_CAP,
}: {
  photos: ProjectPhotoItem[];
  viewAllHref?: string;
  title?: string;
  emptyDescription?: string;
  cap?: number;
}) {
  const shown = photos.slice(0, cap);
  const lightboxImages: LightboxImage[] = shown.map((p) => ({
    id: p.id,
    src: p.src,
    alt: p.alt || p.caption || "Project photo",
    caption: p.caption,
    meta: p.createdAt ? formatDate(p.createdAt) : null,
  }));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-sb-ink underline"
          >
            View all
          </Link>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-sb-muted">{emptyDescription}</p>
      ) : (
        <ImageLightboxTrigger images={lightboxImages}>
          {(open) => (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {shown.map((photo, index) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => open(index)}
                    className="block w-full overflow-hidden rounded-[12px] border border-sb-border text-left transition hover:border-sb-orange/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sb-orange/40"
                    aria-label={`View ${photo.alt || "project photo"} larger`}
                  >
                    <MediaImage
                      src={photo.src}
                      alt={photo.alt}
                      aspectClassName="aspect-square"
                      width={320}
                      height={320}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ImageLightboxTrigger>
      )}
    </Card>
  );
}
