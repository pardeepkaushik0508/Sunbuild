"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
import { pushWithProgress } from "@/lib/navigate";
import {
  Download,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Upload,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import {
  bulkUpdateUsersAction,
  exportUsersReportAction,
  inviteUserAction,
  updateUserAction,
} from "@/lib/actions";
import type { ManageUsersData, ManageUserRow } from "@/lib/users/load-manage-users";
import { OrganizationHeader } from "@/components/dashboard/organization-header";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { FormField, Input, Select } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { useOptionalToast } from "@/components/ui/toast";
import { ROLE_LABELS } from "@/lib/permissions";
import { toSafeErrorMessage } from "@/lib/errors";
import { cn, formatDate, mediaUrl } from "@/lib/utils";

type DialogMode = "add" | "edit" | "view" | "bulk" | null;

function UserAvatar({
  name,
  image,
  initials: init,
  size = "md",
}: {
  name: string;
  image?: string | null;
  initials: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? "h-14 w-14 text-base" : size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  const src = mediaUrl(image);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", dims)}
      />
    );
  }
  const palette = [
    "bg-[#8b5cf6]",
    "bg-[#3b82f6]",
    "bg-[#f97316]",
    "bg-[#10b981]",
    "bg-[#6366f1]",
    "bg-[#ec4899]",
  ];
  const color = palette[(init.charCodeAt(0) || 0) % palette.length];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        dims,
        color
      )}
      aria-hidden
    >
      {init}
    </span>
  );
}

function statusLabel(status: ManageUserRow["status"]) {
  if (status === "ACTIVE") return "Active";
  if (status === "INACTIVE") return "Inactive";
  return "Invited";
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function ManageUsersDashboard({ data }: { data: ManageUsersData }) {
  const router = useRouter();
  const toast = useOptionalToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [selectedUser, setSelectedUser] = useState<ManageUserRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState(data.filters.q);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(
    data.filters.role !== "ALL" ||
      data.filters.status !== "ALL" ||
      Boolean(data.filters.projectId)
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchValue(data.filters.q);
  }, [data.filters.q]);

  const pushQuery = useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      const next = {
        q: data.filters.q,
        role: data.filters.role === "ALL" ? "" : data.filters.role,
        status: data.filters.status === "ALL" ? "" : data.filters.status,
        projectId: data.filters.projectId,
        sort: data.filters.sort,
        page: String(data.pagination.page),
        ...patch,
      };
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== "ALL" && !(k === "page" && v === "1") && !(k === "sort" && v === "name")) {
          params.set(k, v);
        }
      }
      const qs = params.toString();
      startTransition(() => {
        pushWithProgress(router, qs ? `/owner/users?${qs}` : "/owner/users");
      });
    },
    [data.filters, data.pagination.page, router]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchValue === data.filters.q) return;
    debounceRef.current = setTimeout(() => {
      pushQuery({ q: searchValue, page: "1" });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, data.filters.q, pushQuery]);

  const allSelected = useMemo(
    () =>
      data.users.length > 0 &&
      data.users.every((u) => selectedIds.has(u.userId)),
    [data.users, selectedIds]
  );

  function openAdd() {
    setSelectedUser(null);
    setDialog("add");
    setError(null);
  }

  function openView(user: ManageUserRow) {
    setSelectedUser(user);
    setDialog("view");
    setError(null);
  }

  function openEdit(user: ManageUserRow) {
    setSelectedUser(user);
    setDialog("edit");
    setError(null);
  }

  function toggleSelect(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(data.users.map((u) => u.userId)));
  }

  async function handleExport() {
    setError(null);
    try {
      const csv = await exportUsersReportAction();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sunbuild-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(toSafeErrorMessage(e));
    }
  }

  const stats = [
    { label: "Active Users", value: data.stats.activeUsers },
    { label: "Inactive Users", value: data.stats.inactiveUsers },
    { label: "Project Managers", value: data.stats.projectManagers },
    { label: "Subcontractors", value: data.stats.subcontractors },
  ];

  return (
    <div className="space-y-5">
      <OrganizationHeader
        companyName={data.company.name}
        brand={data.company.brand}
        slug={data.company.slug}
        isActive={data.company.isActive}
        usersHref="/owner/users"
        settingsHref="/owner/settings"
        details={[
          { label: "Active users", value: String(data.stats.activeUsers) },
          { label: "Project managers", value: String(data.stats.projectManagers) },
        ]}
      />

      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-sb-red">
          {error}
          <button
            type="button"
            className="ml-3 font-medium underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
          <button
            type="button"
            className="ml-3 font-medium underline"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* User Statistics */}
      <section className="overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="border-b border-[#e5e7eb] px-5 py-4 sm:px-6">
          <h2 className="text-[16px] font-semibold text-[#111827]">User Statistics</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "px-5 py-4 sm:px-6",
                i > 0 && "border-t border-[#e5e7eb] sm:border-t-0 sm:border-l"
              )}
            >
              <p className="text-[12px] font-medium text-[#6b7280]">{s.label}</p>
              <p className="mt-2 text-[28px] font-bold tracking-tight text-[#111827]">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Internal Users and Roles */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111827]">
              Internal Users and Roles
            </h2>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">
              Manage access for {data.company.brand || data.company.name}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="bg-[#facc15] text-[#111827] hover:bg-[#eab308] border-[#facc15]"
            onClick={openAdd}
          >
            <Plus size={16} />
            Add User
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9ca3af]"
            />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by name, email, or role"
              className="h-10 w-full rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] pr-3 pl-9 text-sm outline-none focus:border-sb-orange focus:ring-2 focus:ring-sb-orange/20"
              aria-label="Search users"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <Filter size={16} />
            Filters
          </Button>
          <Select
            value={data.filters.sort}
            onChange={(e) => pushQuery({ sort: e.target.value, page: "1" })}
            aria-label="Sort users"
            className="sm:w-44"
          >
            <option value="name">Sort: Name</option>
            <option value="role">Sort: Role</option>
            <option value="status">Sort: Status</option>
            <option value="activity">Sort: Last Activity</option>
            <option value="created">Sort: Created</option>
          </Select>
        </div>

        {filtersOpen ? (
          <div className="grid gap-3 rounded-[16px] border border-[#e5e7eb] bg-white p-4 sm:grid-cols-3">
            <FormField label="Role">
              <Select
                value={data.filters.role}
                onChange={(e) =>
                  pushQuery({ role: e.target.value, page: "1" })
                }
              >
                <option value="ALL">All roles</option>
                {Object.values(Role).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select
                value={data.filters.status}
                onChange={(e) =>
                  pushQuery({ status: e.target.value, page: "1" })
                }
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="INVITED">Invited</option>
              </Select>
            </FormField>
            <FormField label="Project">
              <Select
                value={data.filters.projectId || ""}
                onChange={(e) =>
                  pushQuery({ projectId: e.target.value, page: "1" })
                }
              >
                <option value="">All projects</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        ) : null}

        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm">
            <span className="font-medium text-[#111827]">
              {selectedIds.size} selected
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialog("bulk")}
            >
              Bulk Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}

        {data.users.length === 0 ? (
          <EmptyState
            title={
              data.filters.q || data.filters.role !== "ALL" || data.filters.status !== "ALL"
                ? "No users match your filters"
                : "No users yet"
            }
            description={
              data.filters.q
                ? "Try a different search or clear filters."
                : "Invite your first team member to get started."
            }
            action={
              <Button type="button" variant="secondary" onClick={openAdd}>
                <Plus size={16} />
                Add User
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="hidden items-center gap-3 border-b border-[#e5e7eb] bg-[#f9fafb] px-4 py-2.5 text-[11px] font-semibold tracking-wide text-[#9ca3af] uppercase lg:grid lg:grid-cols-[auto_minmax(0,1.4fr)_auto_auto_auto_auto_auto]">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[#d1d5db]"
                  aria-label="Select all users on this page"
                />
              </label>
              <span>User</span>
              <span>Status</span>
              <span>Role</span>
              <span>Projects</span>
              <span>Last activity</span>
              <span className="text-right">Actions</span>
            </div>

            <ul className="divide-y divide-[#e5e7eb]">
              {data.users.map((user) => (
                <li key={user.userId} className="px-4 py-4">
                  <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1.4fr)_auto_auto_auto_auto_auto] lg:items-center lg:gap-3">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.userId)}
                        onChange={() => toggleSelect(user.userId)}
                        className="h-4 w-4 rounded border-[#d1d5db]"
                        aria-label={`Select ${user.name}`}
                      />
                    </label>

                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        name={user.name}
                        image={user.image}
                        initials={user.initials}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#111827]">
                          {user.name}
                          {user.isSelf ? (
                            <span className="ml-2 text-xs font-medium text-[#6b7280]">
                              (You)
                            </span>
                          ) : null}
                        </p>
                        <a
                          href={`mailto:${user.email}`}
                          className="truncate text-[13px] text-[#6b7280] hover:text-sb-orange"
                        >
                          {user.email}
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:contents">
                      <StatusBadge tone={statusTone(user.status)}>
                        {statusLabel(user.status)}
                      </StatusBadge>
                      <StatusBadge tone="orange">{user.roleLabel}</StatusBadge>
                      <button
                        type="button"
                        className="text-left text-[13px] font-medium text-[#111827] hover:text-sb-orange lg:justify-self-start"
                        onClick={() => openView(user)}
                        title="View assigned projects"
                      >
                        {user.projectCount}{" "}
                        {user.projectCount === 1 ? "Project" : "Projects"}
                      </button>
                      <p className="text-[13px] text-[#6b7280]">
                        Last: {user.lastActivityLabel}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => openView(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
                        aria-label={`View ${user.name}`}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {data.pagination.totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] px-4 py-3 text-sm">
                <p className="text-[#6b7280]">
                  Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}
                  –
                  {Math.min(
                    data.pagination.page * data.pagination.pageSize,
                    data.pagination.total
                  )}{" "}
                  of {data.pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={data.pagination.page <= 1 || pending}
                    onClick={() =>
                      pushQuery({ page: String(data.pagination.page - 1) })
                    }
                  >
                    Previous
                  </Button>
                  <span className="text-[#6b7280]">
                    Page {data.pagination.page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      data.pagination.page >= data.pagination.totalPages || pending
                    }
                    onClick={() =>
                      pushQuery({ page: String(data.pagination.page + 1) })
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-[#e5e7eb] px-4 py-3 text-sm text-[#6b7280]">
                {data.pagination.total} user{data.pagination.total === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="border-b border-[#e5e7eb] px-5 py-4 sm:px-6">
          <h2 className="text-[16px] font-semibold text-[#111827]">Quick Actions</h2>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-sb-orange/40 hover:bg-[#fff7ed]"
          >
            <UserPlus size={18} className="text-[#111827]" />
            <span className="text-sm font-medium text-[#111827]">Add Users</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedIds.size === 0) {
                setError("Select one or more users first, then use Bulk Edit.");
                return;
              }
              setDialog("bulk");
            }}
            className="flex items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-sb-orange/40 hover:bg-[#fff7ed]"
          >
            <Users size={18} className="text-[#111827]" />
            <span className="text-sm font-medium text-[#111827]">Bulk Edit</span>
          </button>
          <button
            type="button"
            disabled
            title="CSV import is not in the current MVP scope"
            className="flex items-center gap-3 rounded-[12px] border border-dashed border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-left opacity-60"
          >
            <Upload size={18} className="text-[#9ca3af]" />
            <span className="text-sm font-medium text-[#6b7280]">
              Import Users
              <span className="mt-0.5 block text-[11px] font-normal">
                Coming soon
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-sb-orange/40 hover:bg-[#fff7ed]"
          >
            <Download size={18} className="text-[#111827]" />
            <span className="text-sm font-medium text-[#111827]">Export Report</span>
          </button>
        </div>
      </section>

      <AiInsightsPanel insights={data.insights} viewAllHref="/owner/alerts" />

      {(dialog === "add" || dialog === "edit") && (
        <UserFormDialog
          mode={dialog}
          user={selectedUser}
          inviteRoles={data.inviteRoles}
          projects={data.projects}
          onClose={() => setDialog(null)}
          onSubmit={async (formData) => {
            if (dialog === "add") {
              const result = await inviteUserAction(formData);
              if (result?.emailSent) {
                const msg = result.emailMessage || "Invite email sent.";
                setNotice(msg);
                setError(null);
                toast?.success(msg);
              } else if (result?.emailMessage) {
                setError(result.emailMessage);
                setNotice(null);
                toast?.error(result.emailMessage);
              } else {
                setNotice("User created.");
                toast?.success("User created");
              }
            } else {
              await updateUserAction(formData);
              setNotice("User updated.");
              toast?.success("User updated");
            }
            setDialog(null);
            setSelectedUser(null);
            router.refresh();
          }}
        />
      )}

      {dialog === "view" && selectedUser ? (
        <UserViewDialog
          user={selectedUser}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog("edit")}
        />
      ) : null}

      {dialog === "bulk" ? (
        <BulkEditDialog
          count={selectedIds.size}
          inviteRoles={data.inviteRoles}
          onClose={() => setDialog(null)}
          onSubmit={async (formData) => {
            for (const id of selectedIds) formData.append("userIds", id);
            await bulkUpdateUsersAction(formData);
            setDialog(null);
            setSelectedIds(new Set());
            toast?.success("Users updated");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function DialogShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-sb-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UserFormDialog({
  mode,
  user,
  inviteRoles,
  projects,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  user: ManageUserRow | null;
  inviteRoles: Role[];
  projects: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useOptionalToast();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const names = splitName(user?.name ?? "");
  const assigned = new Set(user?.projects.map((p) => p.id) ?? []);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setFormError(null);
    try {
      if (mode === "edit" && user) {
        formData.set("userId", user.userId);
        formData.set("syncProjects", "1");
      }
      await onSubmit(formData);
    } catch (e) {
      const message = toSafeErrorMessage(e);
      setFormError(message);
      toast?.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell
      title={mode === "add" ? "Add User" : "Edit User"}
      onClose={onClose}
      wide
    >
      <form ref={formRef} action={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {formError ? (
          <p className="sm:col-span-2 text-sm text-sb-red">{formError}</p>
        ) : null}
        <FormField label="First Name" required>
          <Input name="firstName" required defaultValue={names.firstName} />
        </FormField>
        <FormField label="Last Name" required>
          <Input name="lastName" required defaultValue={names.lastName} />
        </FormField>
        <FormField label="Email" required className="sm:col-span-2">
          <Input
            name="email"
            type="email"
            required
            defaultValue={user?.email ?? ""}
            placeholder="name@company.com"
          />
        </FormField>
        <FormField label="Phone">
          <Input
            name="phone"
            type="tel"
            defaultValue={user?.phone ?? ""}
            placeholder="+1 403 555 0100"
          />
        </FormField>
        <FormField label="Role" required>
          <Select
            name="role"
            required
            defaultValue={user?.role ?? Role.PROJECT_MANAGER}
          >
            {inviteRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Account status" required>
          <Select name="status" defaultValue={user?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            {mode === "add" ? <option value="INVITED">Invited</option> : null}
          </Select>
        </FormField>
        {mode === "add" ? (
          <FormField
            label="Temporary password"
            required
            className="sm:col-span-2"
            hint="Stored for account setup only — never emailed. Invite email includes a Set password link (48h)."
          >
            <PasswordInput
              name="tempPassword"
              autoComplete="new-password"
              minLength={10}
              required
              placeholder="Min 10 characters"
            />
          </FormField>
        ) : null}
        <FormField
          label="Project assignments"
          className="sm:col-span-2"
          hint="Hold Ctrl/Cmd to select multiple projects."
        >
          <select
            name="projectIds"
            multiple
            defaultValue={[...assigned]}
            className="min-h-28 w-full rounded-[10px] border border-sb-border bg-white px-3 py-2 text-sm outline-none focus:border-sb-orange focus:ring-2 focus:ring-sb-orange/20"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? "Saving…" : mode === "add" ? "Add User" : "Save changes"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

function UserViewDialog({
  user,
  onClose,
  onEdit,
}: {
  user: ManageUserRow;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <DialogShell title="User details" onClose={onClose} wide>
      <div className="flex items-start gap-4">
        <UserAvatar
          name={user.name}
          image={user.image}
          initials={user.initials}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-sb-ink">{user.name}</h3>
            <StatusBadge tone={statusTone(user.status)}>
              {statusLabel(user.status)}
            </StatusBadge>
            <StatusBadge tone="orange">{user.roleLabel}</StatusBadge>
          </div>
          <a
            href={`mailto:${user.email}`}
            className="mt-1 block text-sm text-sb-muted hover:text-sb-orange"
          >
            {user.email}
          </a>
          {user.phone ? (
            <p className="mt-1 text-sm text-sb-muted">{user.phone}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-sb-border p-3">
          <dt className="text-[11px] font-medium tracking-wide text-sb-muted uppercase">
            Last activity
          </dt>
          <dd className="mt-1 text-sm font-medium text-sb-ink">
            {user.lastActivityLabel}
          </dd>
        </div>
        <div className="rounded-[12px] border border-sb-border p-3">
          <dt className="text-[11px] font-medium tracking-wide text-sb-muted uppercase">
            Joined
          </dt>
          <dd className="mt-1 text-sm font-medium text-sb-ink">
            {formatDate(user.createdAt)}
          </dd>
        </div>
        <div className="rounded-[12px] border border-sb-border p-3">
          <dt className="text-[11px] font-medium tracking-wide text-sb-muted uppercase">
            Permissions
          </dt>
          <dd className="mt-1 text-sm text-sb-ink">
            Settings: {user.canEditSettings ? "Yes" : "No"} · Finance:{" "}
            {user.financeAccess ? "Yes" : "No"}
          </dd>
        </div>
        <div className="rounded-[12px] border border-sb-border p-3">
          <dt className="text-[11px] font-medium tracking-wide text-sb-muted uppercase">
            Projects ({user.projectCount})
          </dt>
          <dd className="mt-1 space-y-1">
            {user.projects.length === 0 ? (
              <span className="text-sm text-sb-muted">No project assignments</span>
            ) : (
              user.projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/pm/projects/${p.id}`}
                  className="block text-sm font-medium text-sb-ink hover:text-sb-orange"
                >
                  {p.name}
                </Link>
              ))
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button type="button" variant="secondary" onClick={onEdit}>
          <Pencil size={14} />
          Edit
        </Button>
      </div>
    </DialogShell>
  );
}

function BulkEditDialog({
  count,
  inviteRoles,
  onClose,
  onSubmit,
}: {
  count: number;
  inviteRoles: Role[];
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useOptionalToast();

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit(formData);
    } catch (e) {
      const message = toSafeErrorMessage(e);
      setFormError(message);
      toast?.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell title={`Bulk Edit (${count})`} onClose={onClose}>
      <form action={handleSubmit} className="grid gap-4">
        {formError ? <p className="text-sm text-sb-red">{formError}</p> : null}
        <FormField label="Set status">
          <Select name="status" defaultValue="">
            <option value="">No change</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </FormField>
        <FormField label="Set role">
          <Select name="role" defaultValue="">
            <option value="">No change</option>
            {inviteRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? "Updating…" : "Apply"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
