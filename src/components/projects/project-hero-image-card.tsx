import { ImageIcon } from "lucide-react";
import {
  updateProjectHeroImageAction,
  clearProjectHeroImageAction,
  removeProjectHeroImageAction,
} from "@/lib/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Card } from "@/components/ui/card";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { MediaImage } from "@/components/ui/media-image";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  heroSquareGridClass,
  MAX_HERO_IMAGES,
  projectHeroImageUrls,
} from "@/lib/projects/hero-image-shared";
import { cn } from "@/lib/utils";

export function ProjectHeroImageCard({
  projectId,
  heroImageUrl,
  heroImageUrls,
  className,
}: {
  projectId: string;
  heroImageUrl?: string | null;
  heroImageUrls?: string[] | null;
  className?: string;
}) {
  const urls = projectHeroImageUrls({ heroImageUrl, heroImageUrls });
  const canAddMore = urls.length < MAX_HERO_IMAGES;

  return (
    <Card className={cn("space-y-4", className)}>
      <div>
        <h2 className="font-heading text-lg font-semibold text-sb-ink">
          Client home banner
        </h2>
        <p className="mt-1 text-sm text-sb-muted">
          Upload house mockups the client should always see on their home page.
          Each image shows in a square tile. Progress photos stay in Project
          Photos underneath — they never replace this banner.
        </p>
      </div>

      {urls.length > 0 ? (
        <ul className={cn("grid gap-3", heroSquareGridClass(urls.length))}>
          {urls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="overflow-hidden rounded-[12px] border border-sb-border bg-sb-canvas"
            >
              <MediaImage
                src={url}
                alt={`Client home banner ${index + 1}`}
                thumbnail={false}
                width={640}
                height={640}
                aspectClassName="aspect-square"
                objectFit="contain"
              />
              <ActionForm
                action={removeProjectHeroImageAction}
                successMessage="Banner image removed"
                className="border-t border-sb-border p-2"
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="imageUrl" value={url} />
                <SubmitButton
                  variant="outline"
                  pendingLabel="Removing…"
                  className="h-8 w-full text-xs"
                >
                  Remove
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-sb-border bg-sb-canvas px-4 py-8 text-center text-sb-muted">
          <ImageIcon size={22} aria-hidden />
          <p className="text-sm">
            No banner yet — clients see a placeholder until you upload images.
          </p>
        </div>
      )}

      {canAddMore ? (
        <ActionForm
          action={updateProjectHeroImageAction}
          successMessage="Client home banner saved"
          encType="multipart/form-data"
          className="grid gap-4"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <ImageUploadField
            name="heroImage"
            label={
              urls.length > 0
                ? "Add more banner images"
                : "House mockup images"
            }
            multiple
            maxFiles={MAX_HERO_IMAGES - urls.length}
            previewSquare
            required={urls.length === 0}
            hint={`Select up to ${MAX_HERO_IMAGES - urls.length} image${
              MAX_HERO_IMAGES - urls.length === 1 ? "" : "s"
            } together (Ctrl/Cmd+click). Max ${MAX_HERO_IMAGES} total.`}
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="Uploading…">
              {urls.length > 0 ? "Add images" : "Save banner"}
            </SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="text-xs text-sb-muted">
          Maximum of {MAX_HERO_IMAGES} banner images reached. Remove one to add
          another.
        </p>
      )}

      {urls.length > 0 ? (
        <ActionForm
          action={clearProjectHeroImageAction}
          successMessage="Client home banner removed"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <SubmitButton variant="outline" pendingLabel="Removing…">
            Remove all banners
          </SubmitButton>
        </ActionForm>
      ) : null}
    </Card>
  );
}
