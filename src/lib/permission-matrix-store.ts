import { prisma } from "@/lib/db";
import {
  parsePermissionMatrix,
  type PermissionMatrixState,
} from "@/lib/permission-matrix";

export async function getCompanyPermissionMatrix(
  companyId: string
): Promise<PermissionMatrixState> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { permissionMatrix: true },
  });
  return parsePermissionMatrix(company?.permissionMatrix ?? null);
}

export async function setCompanyPermissionMatrix(
  companyId: string,
  matrix: PermissionMatrixState
): Promise<void> {
  await prisma.company.update({
    where: { id: companyId },
    data: { permissionMatrix: matrix },
  });
}
