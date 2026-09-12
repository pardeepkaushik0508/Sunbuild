"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SitePageKey } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { SitePageEditor } from "@/components/content/site-page-editor";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form";
import { useOptionalToast } from "@/components/ui/toast";
import { saveSitePageAction } from "@/lib/content/actions";
import { SITE_PAGE_META } from "@/lib/content/site-pages";
import { formatDate } from "@/lib/utils";
import { toSafeErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type PageRow = {
  key: SitePageKey;
  title: string;
  bodyHtml: string;
  updatedAt: Date | string;
  updatedBy: { id: string; name: string; email: string } | null;
};

export function SitePagesManager({ pages }: { pages: PageRow[] }) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<SitePageKey>(
    pages[0]?.key ?? SitePageKey.PRIVACY
  );

  const active = useMemo(
    () => pages.find((p) => p.key === activeKey) ?? pages[0],
    [pages, activeKey]
  );

  const [title, setTitle] = useState(active?.title ?? "");
  const [html, setHtml] = useState(active?.bodyHtml ?? "");
  const [dirtyKey, setDirtyKey] = useState<SitePageKey | null>(null);

  function selectPage(key: SitePageKey) {
    if (dirtyKey === activeKey && key !== activeKey) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    const next = pages.find((p) => p.key === key);
    if (!next) return;
    setActiveKey(key);
    setTitle(next.title);
    setHtml(next.bodyHtml);
    setDirtyKey(null);
  }

  function onSave() {
    if (!active) return;
    startTransition(async () => {
      try {
        await saveSitePageAction({
          key: active.key,
          title,
          bodyHtml: html,
        });
        toast?.success("Page saved");
        setDirtyKey(null);
        router.refresh();
      } catch (err) {
        toast?.error(toSafeErrorMessage(err));
      }
    });
  }

  if (!active) {
    return (
      <p className="text-sm text-sb-muted">No content pages available.</p>
    );
  }

  const meta = SITE_PAGE_META[active.key];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {pages.map((p) => {
          const selected = p.key === active.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPage(p.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                selected
                  ? "border-sb-orange bg-sb-orange-soft text-sb-orange-dark"
                  : "border-sb-border bg-white text-sb-muted hover:text-sb-ink"
              )}
            >
              {SITE_PAGE_META[p.key].title}
            </button>
          );
        })}
      </div>

      <div className="rounded-[16px] border border-sb-border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-sb-ink">{meta.title}</h2>
            <p className="mt-0.5 text-sm text-sb-muted">{meta.description}</p>
            <p className="mt-2 text-xs text-sb-muted">
              Last updated {formatDate(new Date(active.updatedAt))}
              {active.updatedBy ? ` · ${active.updatedBy.name}` : ""}
            </p>
          </div>
          <Link
            href={meta.publicPath}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sb-orange hover:underline"
          >
            View public page <ExternalLink size={14} />
          </Link>
        </div>

        <div className="space-y-4">
          <FormField label="Page title" required>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirtyKey(active.key);
              }}
              maxLength={160}
            />
          </FormField>

          <div>
            <p className="mb-1.5 text-sm font-medium text-sb-ink">Content</p>
            <SitePageEditor
              key={active.key}
              content={html}
              onChange={(next) => {
                setHtml(next);
                setDirtyKey(active.key);
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || dirtyKey !== active.key}
              onClick={() => {
                setTitle(active.title);
                setHtml(active.bodyHtml);
                setDirtyKey(null);
              }}
            >
              Reset
            </Button>
            <Button
              type="button"
              disabled={pending || !title.trim()}
              onClick={onSave}
            >
              {pending ? "Saving…" : "Save page"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
