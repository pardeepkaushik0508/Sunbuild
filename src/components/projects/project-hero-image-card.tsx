import { ImageIcon } from "lucide-react";
import { updateProjectHeroImageAction, clearProjectHeroImageAction } from "@/lib/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Card } from "@/components/ui/card";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { MediaImage } from "@/components/ui/media-image";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function ProjectHeroImageCard({
  projectId,
  heroImageUrl,
  className,
}: {
  projectId: string;
  heroImageUrl: string | null;
  className?: string;
}) {
  return (
    <Card className={cn("space-y-4", className)}>
      <div>
        <h2 className="font-heading text-lg font-semibold text-sb-ink">
          Client home banner
        </h2>
        <p className="mt-1 text-sm text-sb-muted">
          Upload the house mockup the client should always see on their home
          page. Progress photos stay in Project Photos underneath — they never
          replace this banner.
        </p>
      </div>

      {heroImageUrl ? (
        <div className="overflow-hidden rounded-[12px] border border-sb-border">
          <MediaImage
            src={heroImageUrl}
            alt="Client home banner"
            thumbnail={false}
            width={1200}
            height={675}
            aspectClassName="aspect-[16/7]"
            className="[&_img]:h-full [&_img]:w-full [&_img]:object-cover"
          />
        </div>
      ) : (
        <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-sb-border bg-sb-canvas px-4 py-8 text-center text-sb-muted">
          <ImageIcon size={22} aria-hidden />
          <p className="text-sm">No banner yet — clients see a placeholder until you upload one.</p>
        </div>
      )}

      <ActionForm
        action={updateProjectHeroImageAction}
        successMessage="Client home banner saved"
        encType="multipart/form-data"
        className="grid gap-4"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <ImageUploadField
          name="heroImage"
          label={heroImageUrl ? "Replace banner image" : "House mockup image"}
          required={!heroImageUrl}
        />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Uploading…">
            {heroImageUrl ? "Update banner" : "Save banner"}
          </SubmitButton>
        </div>
      </ActionForm>

      {heroImageUrl ? (
        <ActionForm
          action={clearProjectHeroImageAction}
          successMessage="Client home banner removed"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <SubmitButton variant="outline" pendingLabel="Removing…">
            Remove banner
          </SubmitButton>
        </ActionForm>
      ) : null}
    </Card>
  );
}
