"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Moon,
  Receipt,
  Settings,
  Shield,
  Sun,
  Users,
  X,
  Camera,
  Wrench,
  CheckSquare,
  AlertTriangle,
  LineChart,
} from "lucide-react";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import type { WhatsAppContact } from "@/components/whatsapp/whatsapp-sidebar";
import { ThemeProvider, useTheme } from "@/components/layout/theme-provider";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { BrandLogo } from "@/components/layout/brand-logo";

const WhatsAppSidebar = dynamic(
  () =>
    import("@/components/whatsapp/whatsapp-sidebar").then(
      (m) => m.WhatsAppSidebar
    ),
  { ssr: false }
);

type ShellProps = {
  children: React.ReactNode;
  user: { name: string; email: string; phone?: string | null };
  role: Role;
  companyName: string;
  projectCount?: number;
  whatsappContacts?: WhatsAppContact[];
};

type NavDef = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: NavDef[];
};

function settingsHrefForRole(role: Role) {
  switch (role) {
    case Role.OWNER:
      return "/owner/settings";
    case Role.CLIENT:
      return "/client";
    case Role.SUBCONTRACTOR:
      return "/sub";
    default:
      // PM, Sales, CEO, Ops, Bookkeeper — personal integrations (Google Calendar)
      return "/settings";
  }
}

function navForRole(role: Role): NavDef[] {
  switch (role) {
    case Role.OWNER:
      return [
        { label: "Overview", href: "/owner", icon: LayoutDashboard },
        { label: "Internal Alerts", href: "/owner/alerts", icon: AlertTriangle },
        { label: "KPI Management", href: "/owner/kpis", icon: LineChart },
        { label: "Jobs Management", href: "/owner/jobs", icon: Briefcase },
        {
          label: "Manage Users",
          href: "/owner/users",
          icon: Users,
          children: [
            { label: "List", href: "/owner/users", icon: Users },
            { label: "Permissions", href: "/owner/permissions", icon: Shield },
          ],
        },
        { label: "Settings", href: "/owner/settings", icon: Settings },
        { label: "Contracts", href: "/pm/contracts", icon: FileText },
        { label: "Leads", href: "/sales/leads", icon: ClipboardList },
        { label: "Approvals", href: "/ceo/approvals", icon: CheckSquare },
      ];
    case Role.CEO:
      return [
        { label: "Overview", href: "/ceo", icon: LayoutDashboard },
        { label: "Jobs Management", href: "/pm/projects", icon: Briefcase },
        { label: "Approvals", href: "/ceo/approvals", icon: CheckSquare },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
    case Role.OPERATIONS_ADMIN:
      return [
        { label: "Overview", href: "/admin", icon: LayoutDashboard },
        { label: "Jobs Management", href: "/pm/projects", icon: Briefcase },
        { label: "Manage Users", href: "/owner/users", icon: Users },
        { label: "Contracts", href: "/pm/contracts", icon: FileText },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
    case Role.SALES_MANAGER:
      return [
        { label: "Overview", href: "/sales", icon: LayoutDashboard },
        { label: "Lead Management", href: "/sales/leads", icon: ClipboardList },
        { label: "Proposals", href: "/sales/proposals", icon: FileText },
        { label: "Contracts", href: "/sales/contracts", icon: FileText },
        { label: "Documents", href: "/sales/documents", icon: FileText },
        { label: "Activities", href: "/sales/activities", icon: CalendarDays },
        { label: "Reports", href: "/sales/reports", icon: Briefcase },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
    case Role.PROJECT_MANAGER:
      return [
        { label: "Overview", href: "/pm", icon: LayoutDashboard },
        { label: "Projects", href: "/pm/projects", icon: Briefcase },
        { label: "To-Dos", href: "/pm/tasks", icon: CheckSquare },
        { label: "Schedule", href: "/pm/schedule", icon: CalendarDays },
        { label: "Daily Logs", href: "/pm/daily-logs", icon: ClipboardList },
        { label: "RFIs", href: "/pm/rfis", icon: MessageCircle },
        { label: "Change Orders", href: "/pm/change-orders", icon: FileText },
        { label: "Selection", href: "/pm/selections", icon: Home },
        { label: "Documents", href: "/pm/documents", icon: FileText },
        { label: "Photos", href: "/pm/photos", icon: Camera },
        { label: "Contracts", href: "/pm/contracts", icon: FileText },
        { label: "Warranty", href: "/pm/warranty", icon: Wrench },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
    case Role.BOOKKEEPER:
      return [
        { label: "Overview", href: "/bookkeeper", icon: LayoutDashboard },
        { label: "Invoices", href: "/bookkeeper/invoices", icon: Receipt },
        { label: "Settings", href: "/settings", icon: Settings },
      ];
    case Role.SUBCONTRACTOR:
      return [
        { label: "Jobs", href: "/sub", icon: Briefcase },
        { label: "Daily Logs", href: "/sub/daily-logs", icon: ClipboardList },
      ];
    case Role.CLIENT:
      return [
        { label: "Overview", href: "/client", icon: LayoutDashboard },
        { label: "Selections", href: "/client/selections", icon: Home },
        { label: "Schedule", href: "/client/schedule", icon: CalendarDays },
        { label: "Calendar", href: "/client/calendar", icon: CalendarDays },
        { label: "Payments", href: "/client/payments", icon: Receipt },
        { label: "Documents", href: "/client/documents", icon: FileText },
        { label: "Photos", href: "/client/photos", icon: Camera },
        { label: "Warranty", href: "/client/warranty", icon: Wrench },
      ];
    default:
      return [];
  }
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className="hidden h-9 w-9 items-center justify-center rounded-full border border-sb-border text-sb-muted hover:bg-sb-canvas sm:inline-flex"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

function AppShellInner({
  children,
  user,
  role,
  companyName,
  projectCount = 0,
  whatsappContacts = [],
}: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const nav = useMemo(() => navForRole(role), [role]);
  const settingsHref = settingsHrefForRole(role);

  const autoExpanded = useMemo(() => {
    const keys = new Set<string>();
    for (const item of nav) {
      if (!item.children?.length) continue;
      const childActive = item.children.some(
        (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
      );
      if (childActive) keys.add(`${item.href}-${item.label}`);
    }
    return keys;
  }, [nav, pathname]);

  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>(
    {}
  );

  function isGroupOpen(key: string) {
    if (key in manualExpanded) return manualExpanded[key];
    return autoExpanded.has(key);
  }

  function toggleGroup(key: string) {
    setManualExpanded((prev) => ({
      ...prev,
      [key]: !(key in prev ? prev[key] : autoExpanded.has(key)),
    }));
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function signOut() {
    const { signOutAndRedirect } = await import("@/lib/auth-sign-out");
    await signOutAndRedirect();
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-sb-canvas text-sb-body">
      <header className="fixed inset-x-0 top-0 z-50 h-[var(--sb-header-height)] border-b border-sb-border bg-white/95 backdrop-blur-sm dark:bg-[color:var(--sb-surface)]/95">
        <div className="flex h-full items-center gap-3 px-4 md:px-6">
          <button
            type="button"
            className="rounded-[10px] p-2 text-sb-muted hover:bg-sb-canvas lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>

          <BrandLogo />

          <GlobalSearch />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <NotificationsMenu />
            <ProfileMenu
              user={user}
              role={role}
              companyName={companyName}
              projectCount={projectCount}
              settingsHref={settingsHref}
            />
            <Button
              variant="whatsapp"
              size="sm"
              onClick={() => setWhatsAppOpen(true)}
            >
              <MessageCircle size={14} />
              WhatsApp
            </Button>
          </div>
        </div>
      </header>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu overlay"
        />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-[var(--sb-header-height)] z-[45] flex w-[var(--sb-sidebar-width)] flex-col border-r border-sb-border bg-white dark:bg-[color:var(--sb-sidebar)]",
          "h-[calc(100dvh-var(--sb-header-height))]",
          "transition-transform duration-200 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Primary"
      >
        <nav className="sb-shell-nav-scroll min-h-0 flex-1 p-4">
          <div className="flex flex-col gap-1">
            {nav.map((item) => {
              const groupKey = `${item.href}-${item.label}`;
              const childActive = item.children?.some(
                (c) =>
                  pathname === c.href || pathname.startsWith(`${c.href}/`)
              );
              const active =
                pathname === item.href ||
                childActive ||
                (item.href !== "/owner" &&
                  item.href !== "/pm" &&
                  item.href !== "/client" &&
                  item.href !== "/ceo" &&
                  item.href !== "/sales" &&
                  item.href !== "/bookkeeper" &&
                  item.href !== "/admin" &&
                  item.href !== "/sub" &&
                  !item.children &&
                  pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;

              if (item.children?.length) {
                const groupOpen = isGroupOpen(groupKey);
                return (
                  <div key={groupKey} className="space-y-1">
                    <button
                      type="button"
                      aria-expanded={groupOpen}
                      onClick={() => toggleGroup(groupKey)}
                      className={cn(
                        "flex h-14 w-full items-center gap-3 rounded-[14px] px-4 text-left text-sm font-medium transition hover:bg-sb-canvas",
                        childActive || groupOpen
                          ? "bg-sb-canvas text-sb-ink"
                          : "text-[#4b5563]"
                      )}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sb-canvas text-sb-muted">
                        <Icon size={16} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      <ChevronDown
                        size={16}
                        className={cn(
                          "shrink-0 text-sb-muted transition-transform duration-200",
                          groupOpen && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                    {groupOpen ? (
                      <div className="ml-4 space-y-1 border-l border-sb-border pl-3">
                        {item.children.map((child) => {
                          const isChild =
                            pathname === child.href ||
                            pathname.startsWith(`${child.href}/`);
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setOpen(false)}
                              className={cn(
                                "flex h-11 items-center gap-3 rounded-[12px] px-3 text-sm font-medium transition",
                                isChild
                                  ? "bg-sb-orange text-white shadow-sm"
                                  : "text-[#4b5563] hover:bg-sb-canvas"
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded-lg",
                                  isChild
                                    ? "bg-white/20 text-white"
                                    : "bg-sb-canvas text-sb-muted"
                                )}
                              >
                                <ChildIcon size={14} />
                              </span>
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <Link
                  key={groupKey}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-[14px] px-4 text-sm font-medium transition",
                    active
                      ? "bg-sb-yellow text-sb-ink shadow-sm"
                      : "text-[#4b5563] hover:bg-sb-canvas"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                      active
                        ? "bg-white/70 text-sb-purple"
                        : "bg-sb-canvas text-sb-muted"
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-sb-border p-4">
          <button
            type="button"
            className="w-full rounded-[12px] border border-sb-border px-4 py-3 text-left text-sm text-sb-muted hover:bg-sb-canvas"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="sb-shell-main-scroll h-dvh pt-[var(--sb-header-height)] lg:pl-[var(--sb-sidebar-width)]">
        <div className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-4 md:px-6 lg:px-8 lg:py-6">
          {children}
        </div>
      </main>

      <WhatsAppSidebar
        open={whatsAppOpen}
        onClose={() => setWhatsAppOpen(false)}
        contacts={whatsappContacts}
      />
    </div>
  );
}

export function AppShell(props: ShellProps) {
  return (
    <ThemeProvider>
      <AppShellInner {...props} />
    </ThemeProvider>
  );
}
