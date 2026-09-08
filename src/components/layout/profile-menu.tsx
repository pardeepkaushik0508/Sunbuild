"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";

export function ProfileMenu({
  user,
  role,
  companyName,
  projectCount = 0,
  settingsHref,
}: {
  user: { name: string; email: string };
  role: Role;
  companyName: string;
  projectCount?: number;
  settingsHref: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function signOut() {
    const { signOutAndRedirect } = await import("@/lib/auth-sign-out");
    await signOutAndRedirect();
  }

  const profileHref =
    role === Role.OWNER ? "/owner/settings" : settingsHref;

  return (
    <div className="relative flex items-center gap-2" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f2937] text-xs font-semibold text-white ring-2 ring-white"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {initials(user.name)}
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="hidden min-w-[158px] items-center justify-between gap-2 rounded-[10px] border border-sb-orange/40 bg-sb-orange-soft px-3 py-1.5 sm:flex"
      >
        <div className="text-left">
          <p className="text-[12px] font-semibold text-sb-ink">
            {ROLE_LABELS[role]}
          </p>
          <p className="text-[10px] text-sb-muted">
            {projectCount > 0 ? `${projectCount} projects` : companyName}
          </p>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-sb-muted transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[60] mt-2 w-56 overflow-hidden rounded-[14px] border border-sb-border bg-sb-surface shadow-lg"
        >
          <div className="border-b border-sb-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-sb-ink">
              {user.name}
            </p>
            <p className="truncate text-[12px] text-sb-muted">{user.email}</p>
          </div>
          <div className="p-1.5">
            <Link
              href={profileHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-sb-ink hover:bg-sb-canvas"
            >
              <UserRound size={15} />
              My Profile
            </Link>
            <Link
              href={settingsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-sb-ink hover:bg-sb-canvas"
            >
              <Settings size={15} />
              Account Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-sb-red hover:bg-sb-red-soft"
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
