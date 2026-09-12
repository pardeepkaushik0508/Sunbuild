import { Role } from "@prisma/client";
import { ManageUsersDashboard } from "@/components/owner/manage-users-dashboard";
import { loadManageUsersData } from "@/lib/users/load-manage-users";
import { requireRole } from "@/lib/session";
import type { UserAccountStatus } from "@/lib/users/load-manage-users";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    projectId?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

const PAGE_SIZE_OPTIONS = [5, 10, 20, 25, 50] as const;

export default async function OwnerUsersPage({ searchParams }: PageProps) {
  const session = await requireRole([Role.OWNER, Role.OPERATIONS_ADMIN]);
  const params = await searchParams;

  const page = Number.parseInt(params.page ?? "1", 10);
  const rawPageSize = Number.parseInt(params.pageSize ?? "20", 10);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
    ? rawPageSize
    : 20;
  const role =
    params.role && (Object.values(Role) as string[]).includes(params.role)
      ? (params.role as Role)
      : "ALL";
  const status =
    params.status === "ACTIVE" ||
    params.status === "INACTIVE" ||
    params.status === "INVITED"
      ? (params.status as UserAccountStatus)
      : "ALL";

  const data = await loadManageUsersData(session, {
    q: params.q,
    role,
    status,
    projectId: params.projectId,
    sort: params.sort as
      | "name"
      | "role"
      | "status"
      | "activity"
      | "created"
      | undefined,
    page: Number.isFinite(page) ? page : 1,
    pageSize,
  });

  return <ManageUsersDashboard data={data} />;
}
