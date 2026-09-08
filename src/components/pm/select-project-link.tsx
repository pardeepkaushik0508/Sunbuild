"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setSelectedProjectAction } from "@/lib/pm/project-actions";

/** Sets PM project cookie then navigates to the dashboard with that project. */
export function PmSelectProjectLink({
  projectId,
  href,
  className,
  children,
  "aria-label": ariaLabel,
  title,
}: {
  projectId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Link
      href={href}
      className={className}
      aria-label={ariaLabel}
      title={title}
      aria-disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("projectId", projectId);
        fd.set("returnTo", href);
        startTransition(async () => {
          await setSelectedProjectAction(fd);
        });
      }}
    >
      {children}
    </Link>
  );
}
