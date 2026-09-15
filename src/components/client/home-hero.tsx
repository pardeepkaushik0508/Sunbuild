import Link from "next/link";
import { MediaImage } from "@/components/ui/media-image";

/**
 * BuilderTrend-style full-bleed home hero for the client portal.
 */
export function ClientHomeHero({
  projectName,
  statusLabel,
  imageSrc,
  progressPercent,
  photosHref,
}: {
  projectName: string;
  statusLabel: string;
  imageSrc: string | null;
  progressPercent: number;
  photosHref: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[16px] border border-sb-border bg-sb-ink text-white shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
      <div className="relative min-h-[220px] sm:min-h-[320px] lg:min-h-[380px]">
        {imageSrc ? (
          <MediaImage
            src={imageSrc}
            alt={projectName}
            thumbnail={false}
            width={1600}
            height={900}
            aspectClassName="absolute inset-0 h-full w-full min-h-[220px] sm:min-h-[320px] lg:min-h-[380px]"
            className="[&_img]:h-full [&_img]:w-full [&_img]:object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1f2937] via-[#111827] to-[#0b1220]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
        <div className="relative z-10 flex min-h-[220px] flex-col justify-end gap-3 p-5 sm:min-h-[320px] sm:p-7 lg:min-h-[380px]">
          <p className="text-xs font-semibold tracking-[0.14em] text-sb-yellow uppercase">
            {statusLabel}
          </p>
          <h1 className="max-w-3xl font-[family-name:var(--font-outfit)] text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            {projectName}
          </h1>
          <div className="flex flex-wrap items-end justify-between gap-3">
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
      </div>
    </section>
  );
}
