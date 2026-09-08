"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { canEditSettings } from "@/lib/permissions";
import { ForbiddenError, AppError, toSafeErrorMessage } from "@/lib/errors";
import {
  getCompanySettings,
  setCompanySetting,
} from "@/lib/settings/store";
import { SETTING_KEYS } from "@/lib/settings/types";
import {
  fileStorageSchema,
  mfaPolicySchema,
  passwordPolicySchema,
  sessionTimeoutSchema,
} from "@/lib/settings/validation";

function assertSettingsEditor(session: Awaited<ReturnType<typeof requireSession>>) {
  const { role, canEditSettings: flag } = session.membership;
  if (!canEditSettings(role, flag)) {
    throw new ForbiddenError("You cannot edit settings");
  }
}

function assertSecurityEditor(session: Awaited<ReturnType<typeof requireSession>>) {
  assertSettingsEditor(session);
  // Critical security settings: Owner only for MVP
  if (session.membership.role !== Role.OWNER) {
    throw new ForbiddenError("Only the Owner can change security settings");
  }
}

function assertOperationalEditor(
  session: Awaited<ReturnType<typeof requireSession>>
) {
  assertSettingsEditor(session);
  const role = session.membership.role;
  if (role !== Role.OWNER && role !== Role.OPERATIONS_ADMIN) {
    throw new ForbiddenError("Not allowed to change this setting");
  }
}

export async function loadSettingsAction() {
  try {
    const session = await requireSession();
    assertSettingsEditor(session);
    const settings = await getCompanySettings(session.membership.companyId);
    return { ok: true as const, settings };
  } catch (e) {
    return { ok: false as const, error: toSafeErrorMessage(e) };
  }
}

export async function updateMfaPolicyAction(input: {
  enforced: boolean;
  requiredRoles: Role[];
}) {
  try {
    const session = await requireSession();
    assertSecurityEditor(session);
    const parsed = mfaPolicySchema.parse(input);
    await setCompanySetting({
      companyId: session.membership.companyId,
      key: SETTING_KEYS.MFA_POLICY,
      category: "security",
      value: parsed,
      actorUserId: session.user.id,
      action: "SETTINGS_MFA_UPDATED",
    });
    revalidatePath("/owner/settings");
    revalidatePath("/account/mfa");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: toSafeErrorMessage(e) };
  }
}

export async function updatePasswordPolicyAction(input: {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}) {
  try {
    const session = await requireSession();
    assertSecurityEditor(session);
    const parsed = passwordPolicySchema.parse(input);
    await setCompanySetting({
      companyId: session.membership.companyId,
      key: SETTING_KEYS.PASSWORD_POLICY,
      category: "security",
      value: parsed,
      actorUserId: session.user.id,
      action: "SETTINGS_PASSWORD_POLICY_UPDATED",
    });
    revalidatePath("/owner/settings");
    revalidatePath("/reset-password");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: toSafeErrorMessage(e) };
  }
}

export async function updateSessionTimeoutAction(input: {
  minutes: number;
}) {
  try {
    const session = await requireSession();
    assertSecurityEditor(session);
    const minutes = sessionTimeoutSchema.parse(input.minutes);
    await setCompanySetting({
      companyId: session.membership.companyId,
      key: SETTING_KEYS.SESSION_TIMEOUT,
      category: "security",
      value: minutes,
      actorUserId: session.user.id,
      action: "SETTINGS_SESSION_TIMEOUT_UPDATED",
    });
    revalidatePath("/owner/settings");
    revalidatePath("/");
    return { ok: true as const, minutes };
  } catch (e) {
    return { ok: false as const, error: toSafeErrorMessage(e) };
  }
}

export async function updateFileStorageAction(input: {
  maxUploadBytes: number;
  allowedExtensions: string[];
  categories: string[];
}) {
  try {
    const session = await requireSession();
    assertOperationalEditor(session);
    const current = await getCompanySettings(session.membership.companyId);
    const parsed = fileStorageSchema.parse({
      provider: current.fileStorage.provider,
      visibility: "private" as const,
      maxUploadBytes: input.maxUploadBytes,
      allowedExtensions: input.allowedExtensions,
      categories: input.categories,
    });
    // Provider changes require infra — do not allow elevating to cloud without env.
    if (parsed.provider !== "local" && parsed.provider !== current.fileStorage.provider) {
      throw new AppError(
        "Cloud storage providers are configured via environment in a later phase"
      );
    }
    await setCompanySetting({
      companyId: session.membership.companyId,
      key: SETTING_KEYS.FILE_STORAGE,
      category: "storage",
      value: parsed,
      actorUserId: session.user.id,
      action: "SETTINGS_FILE_STORAGE_UPDATED",
    });
    revalidatePath("/owner/settings");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: toSafeErrorMessage(e) };
  }
}

/** Owner/Ops: verify SMTP without exposing credentials. */
export async function verifySmtpConnectionAction() {
  try {
    const session = await requireSession();
    assertOperationalEditor(session);
    const { verifySmtpConnection } = await import("@/lib/email");
    const result = await verifySmtpConnection();
    return { ok: result.ok as boolean, message: result.message };
  } catch (e) {
    return { ok: false as const, message: toSafeErrorMessage(e) };
  }
}
