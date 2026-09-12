"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, LogOut, UserRound } from "lucide-react";
import { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn, initials, mediaUrl } from "@/lib/utils";
import { switchActiveMembership } from "@/lib/switch-membership";
import { clearActiveMembershipAction } from "@/lib/clear-membership-action";
import { startNavigationProgress } from "@/lib/navigation-progress";

export type ProfileOption = {
  id: string;
  role: Role;
  companyName: string;
};

export function ProfileMenu({
  user,
  role,
  companyName,
  projectCount = 0,
  profiles = [],
  activeMembershipId,
}: {
  user: { name: string; email: string; image?: string | null };
  role: Role;
  companyName: string;
  projectCount?: number;
  settingsHref?: string;
  profiles?: ProfileOption[];
  activeMembershipId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const avatarSrc = mediaUrl(user.image);

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
    try {
      await clearActiveMembershipAction();
    } catch {
      // ignore — still sign out
    }
    const { signOutAndRedirect } = await import("@/lib/auth-sign-out");
    await signOutAndRedirect();
  }

  function switchProfile(membershipId: string) {
    if (membershipId === activeMembershipId || pending) return;
    setOpen(false);
    startNavigationProgress();
    startTransition(() => {
      void switchActiveMembership(membershipId);
    });
  }

  const showSwitcher = profiles.length > 1;

  return (
    <div className="relative flex items-center gap-2" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#1f2937] text-xs font-semibold text-white ring-2 ring-white"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          initials(user.name)
        )}
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
          className="absolute right-0 top-full z-[60] mt-2 w-64 overflow-hidden rounded-[14px] border border-sb-border bg-sb-surface shadow-lg"
        >
          <div className="border-b border-sb-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-sb-ink">
              {user.name}
            </p>
            <p className="truncate text-[12px] text-sb-muted">{user.email}</p>
          </div>

          {showSwitcher ? (
            <div className="border-b border-sb-border p-1.5">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sb-muted">
                Switch profile
              </p>
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {profiles.map((p) => {
                  const active = p.id === activeMembershipId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      disabled={pending || active}
                      onClick={() => switchProfile(p.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition",
                        active
                          ? "bg-sb-orange-soft text-sb-ink"
                          : "text-sb-ink hover:bg-sb-canvas",
                        pending && "opacity-60"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {ROLE_LABELS[p.role]}
                        </span>
                        <span className="block truncate text-[11px] text-sb-muted">
                          {p.companyName}
                        </span>
                      </span>
                      {active ? (
                        <Check size={14} className="shrink-0 text-sb-orange" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="p-1.5">
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-sb-ink hover:bg-sb-canvas"
            >
              <UserRound size={15} />
              My Profile
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
