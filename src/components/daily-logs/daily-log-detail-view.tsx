import Link from "next/link";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, mediaUrl } from "@/lib/utils";
import { MediaImage } from "@/components/ui/media-image";

export type DailyLogDetailData = {
  id: string;
  logDate: Date;
  workCompleted: string | null;
  siteNotes: string | null;
  status: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string };
  author: { id: string; name: string; email?: string | null };
  photos: Array<{
    id: string;
    filePath: string;
    fileName: string;
    mediaBytes: number | null;
    createdAt: Date;
  }>;
};

type Props = {
  log: DailyLogDetailData;
  backHref: string;
  backLabel?: string;
  projectHref?: string | null;
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-sb-border py-3 last:border-b-0 sm:grid-cols-[160px_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wider text-sb-muted">
        {label}
      </dt>
      <dd className="text-sm text-sb-ink">{value}</dd>
    </div>
  );
}

export function DailyLogDetailView({
  log,
  backHref,
  backLabel = "All daily logs",
  projectHref,
}: Props) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Daily log · ${formatDate(log.logDate)}`}
        description={`${log.project.name} · submitted by ${log.author.name}`}
        actions={
          <Link href={backHref}>
            <Button variant="outline" size="sm">
              {backLabel}
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={log.status === "SUBMITTED" ? "green" : "neutral"}>
          {log.status.replace(/_/g, " ")}
        </StatusBadge>
        <span className="text-sm text-sb-muted">
          Submitted {formatDate(log.submittedAt)}
        </span>
        {log.photos.length > 0 ? (
          <span className="text-sm text-sb-muted">
            · {log.photos.length} photo{log.photos.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
              Work completed
            </h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-sb-text">
              {log.workCompleted?.trim() || "—"}
            </p>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
              Site notes
            </h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-sb-text">
              {log.siteNotes?.trim() || "No site notes provided."}
            </p>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
              Photos
            </h2>
            {log.photos.length === 0 ? (
              <p className="mt-4 text-sm text-sb-muted">No photos attached.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {log.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={mediaUrl(photo.filePath) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="group block overflow-hidden rounded-[10px] border border-sb-border bg-sb-canvas"
                  >
                    <MediaImage
                      src={photo.filePath}
                      alt={photo.fileName}
                      aspectClassName="aspect-square"
                      width={400}
                      height={400}
                    />
                    <div className="truncate px-2 py-1.5 text-[11px] text-sb-muted group-hover:text-sb-ink">
                      {photo.fileName}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Log details
          </h2>
          <dl className="mt-2">
            <MetaRow label="Log date" value={formatDate(log.logDate)} />
            <MetaRow
              label="Project"
              value={
                projectHref ? (
                  <Link
                    href={projectHref}
                    className="font-medium text-sb-ink hover:underline"
                  >
                    {log.project.name}
                  </Link>
                ) : (
                  log.project.name
                )
              }
            />
            <MetaRow
              label="Submitted by"
              value={
                <span>
                  {log.author.name}
                  {log.author.email ? (
                    <span className="mt-0.5 block text-xs text-sb-muted">
                      {log.author.email}
                    </span>
                  ) : null}
                </span>
              }
            />
            <MetaRow label="Status" value={log.status.replace(/_/g, " ")} />
            <MetaRow label="Submitted at" value={formatDate(log.submittedAt)} />
            <MetaRow label="Created" value={formatDate(log.createdAt)} />
            <MetaRow label="Last updated" value={formatDate(log.updatedAt)} />
            <MetaRow
              label="Photos"
              value={`${log.photos.length} attached`}
            />
          </dl>
        </Card>
      </div>
    </div>
  );
}
