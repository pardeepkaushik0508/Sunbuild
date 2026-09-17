"use client";

import { useRouter } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { MediaImage } from "@/components/ui/media-image";
import { Button } from "@/components/ui/button";
import { useOptionalToast } from "@/components/ui/toast";
import { toSafeErrorMessage } from "@/lib/errors";
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
  const toast = useOptionalToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const busy = pending || uploading;

  async function upload(formData: FormData) {
    setUploading(true);
    try {
      formData.set("projectId", projectId);
      const res = await fetch(`/api/projects/${projectId}/hero`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };
      if (!res.ok) {
        toast?.error(
          toSafeErrorMessage(data.error || `Upload failed (${res.status})`)
        );
        return;
      }
      toast?.success("Client home banner saved");
      startTransition(() => router.refresh());
    } catch (err) {
      toast?.error(toSafeErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeOne(imageUrl: string) {
    setUploading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/hero?imageUrl=${encodeURIComponent(imageUrl)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast?.error(toSafeErrorMessage(data.error || "Remove failed"));
        return;
      }
      toast?.success("Banner image removed");
      startTransition(() => router.refresh());
    } catch (err) {
      toast?.error(toSafeErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeAll() {
    setUploading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hero`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast?.error(toSafeErrorMessage(data.error || "Remove failed"));
        return;
      }
      toast?.success("Client home banner removed");
      startTransition(() => router.refresh());
    } catch (err) {
      toast?.error(toSafeErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

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
                thumbnail
                priority={index < 4}
                width={640}
                height={640}
                aspectClassName="aspect-square"
                objectFit="contain"
              />
              <div className="border-t border-sb-border p-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-full text-xs"
                  disabled={busy}
                  onClick={() => void removeOne(url)}
                >
                  Remove
                </Button>
              </div>
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
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void upload(fd);
          }}
        >
          <ImageUploadField
            name="heroImage"
            label={
              urls.length > 0 ? "Add more banner images" : "House mockup images"
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
            <Button type="submit" disabled={busy}>
              {uploading
                ? "Uploading…"
                : urls.length > 0
                  ? "Add images"
                  : "Save banner"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-sb-muted">
          Maximum of {MAX_HERO_IMAGES} banner images reached. Remove one to add
          another.
        </p>
      )}

      {urls.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void removeAll()}
        >
          {uploading ? "Removing…" : "Remove all banners"}
        </Button>
      ) : null}
    </Card>
  );
}
