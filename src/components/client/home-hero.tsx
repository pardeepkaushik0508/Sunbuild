import Link from "next/link";
import { MediaImage } from "@/components/ui/media-image";
import { heroSquareGridClass } from "@/lib/projects/hero-image-shared";
import { cn } from "@/lib/utils";

/**
 * Client portal home hero — project status + square house-mockup gallery.
 */
export function ClientHomeHero({
  projectName,
  statusLabel,
  imageSrc,
  imageSrcs,
  progressPercent,
  photosHref,
}: {
  projectName: string;
  statusLabel: string;
  /** @deprecated prefer imageSrcs */
  imageSrc?: string | null;
  imageSrcs?: string[] | null;
  progressPercent: number;
  photosHref: string;
}) {
  const urls =
    imageSrcs && imageSrcs.length > 0
      ? imageSrcs.filter(Boolean)
      : imageSrc
        ? [imageSrc]
        : [];

  return (
    <section className="space-y-3">
      <div className="rounded-[16px] border border-sb-border bg-sb-ink p-5 text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] sm:p-7">
        <p className="text-xs font-semibold tracking-[0.14em] text-sb-yellow uppercase">
          {statusLabel}
        </p>
        <h1 className="mt-2 max-w-3xl font-[family-name:var(--font-outfit)] text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          {projectName}
        </h1>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[160px] max-w-xs flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-white/80">
              <span>Build progress</span>
              <span className="font-semibold text-white">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-sb-yellow"
                style={{
                  width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                }}
              />
            </div>
          </div>
          <Link
            href={photosHref}
            className="inline-flex h-9 items-center rounded-[8px] border border-white/30 bg-white/10 px-3 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20"
          >
            View photos
          </Link>
        </div>
      </div>

      {urls.length > 0 ? (
        <ul className={cn("grid gap-3", heroSquareGridClass(urls.length))}>
          {urls.map((src, index) => (
            <li
              key={`${src}-${index}`}
              className="overflow-hidden rounded-[16px] border border-sb-border bg-sb-canvas shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
            >
              <MediaImage
                src={src}
                alt={`${projectName} banner ${index + 1}`}
                thumbnail={false}
                width={800}
                height={800}
                aspectClassName="aspect-square"
                objectFit="contain"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
