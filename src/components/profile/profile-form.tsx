"use client";

import { useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Card } from "@/components/ui/card";
import { FormField, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateOwnProfileAction } from "@/lib/actions";
import { cn, initials, mediaUrl } from "@/lib/utils";

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string; image?: string | null };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const currentSrc = preview || mediaUrl(user.image);

  return (
    <Card className="max-w-xl">
      <ActionForm
        action={updateOwnProfileAction}
        successMessage="Profile updated"
        className="space-y-6"
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-[#1f2937] ring-2 ring-sb-border focus:outline-none focus:ring-2 focus:ring-sb-orange"
            aria-label="Change profile photo"
          >
            {currentSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentSrc}
                alt={user.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-white">
                {initials(user.name)}
              </span>
            )}
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100"
              )}
            >
              <Camera size={18} aria-hidden />
            </span>
          </button>

          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-sb-ink">Profile photo</p>
            <p className="text-[12px] text-sb-muted">
              JPG, PNG, GIF, or WebP — max 5MB
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[13px] font-medium text-sb-orange hover:underline"
            >
              Upload new photo
            </button>
            <input
              ref={fileRef}
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setPreview(null);
                  return;
                }
                const url = URL.createObjectURL(file);
                setPreview((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return url;
                });
              }}
            />
          </div>
        </div>

        <FormField label="Full name" required>
          <Input
            name="name"
            defaultValue={user.name}
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </FormField>

        <FormField label="Email">
          <Input
            value={user.email}
            disabled
            readOnly
            className="bg-sb-canvas text-sb-muted"
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-sb-muted">
            <UserRound size={12} aria-hidden />
            Email cannot be changed here
          </p>
        </FormField>

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
