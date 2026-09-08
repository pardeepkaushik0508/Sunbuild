import { prisma } from "@/lib/db";
import {
  parsePermissionMatrix,
  type PermissionMatrixState,
} from "@/lib/permission-matrix";

type Row = { permissionMatrix: string | null };

/** Read matrix via SQL so it works even if Prisma Client wasn't regenerated yet. */
export async function getCompanyPermissionMatrix(
  companyId: string
): Promise<PermissionMatrixState> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT permissionMatrix FROM Company WHERE id = ?`,
    companyId
  );
  const raw = rows[0]?.permissionMatrix ?? null;
  if (raw == null) return parsePermissionMatrix(null);
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsePermissionMatrix(parsed);
  } catch {
    return parsePermissionMatrix(null);
  }
}

/** Write matrix via SQL (column exists after db push). */
export async function setCompanyPermissionMatrix(
  companyId: string,
  matrix: PermissionMatrixState
): Promise<void> {
  const json = JSON.stringify(matrix);
  await prisma.$executeRawUnsafe(
    `UPDATE Company SET permissionMatrix = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    json,
    companyId
  );
}
