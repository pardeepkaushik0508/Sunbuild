"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useOptionalToast } from "@/components/ui/toast";
import { toSafeErrorMessage } from "@/lib/errors";

/** Client upload for signed contract PDF — uses API route (not Server Actions). */
export function SignedContractUploadForm({
  contractId,
}: {
  contractId: string;
}) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [uploading, setUploading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast?.error("Signed PDF file required");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/signed`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fileName?: string;
      };
      if (!res.ok) {
        toast?.error(
          toSafeErrorMessage(data.error || `Upload failed (${res.status})`)
        );
        return;
      }
      toast?.success("Signed PDF attached");
      form.reset();
      router.refresh();
    } catch (err) {
      toast?.error(toSafeErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Input
        name="file"
        type="file"
        accept=".pdf,application/pdf"
        required
        className="text-xs"
        disabled={uploading}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={uploading}
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        {uploading ? "Uploading…" : "Attach Signed PDF"}
      </Button>
    </form>
  );
}
