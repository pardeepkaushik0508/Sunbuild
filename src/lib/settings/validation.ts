import { z } from "zod";
import { Role } from "@prisma/client";
import {
  SESSION_TIMEOUT_OPTIONS,
  type PasswordPolicy,
} from "@/lib/settings/types";

const roleSchema = z.nativeEnum(Role);

export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(8).max(128),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSpecial: z.boolean(),
});

export const mfaPolicySchema = z.object({
  enforced: z.boolean(),
  requiredRoles: z.array(roleSchema).min(1),
});

export const sessionTimeoutSchema = z
  .number()
  .int()
  .refine(
    (v): v is (typeof SESSION_TIMEOUT_OPTIONS)[number] =>
      (SESSION_TIMEOUT_OPTIONS as readonly number[]).includes(v),
    { message: "Invalid session timeout" }
  );

export const fileStorageSchema = z.object({
  provider: z.enum(["local", "s3", "r2", "supabase"]),
  maxUploadBytes: z
    .number()
    .int()
    .min(1024 * 1024)
    .max(100 * 1024 * 1024),
  allowedExtensions: z.array(z.string().startsWith(".")).min(1),
  visibility: z.literal("private"),
  categories: z.array(z.string().min(1)).min(1),
});

export function assertPasswordMeetsPolicy(
  password: string,
  policy: PasswordPolicy
): string | null {
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters`;
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter";
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return "Password must include a lowercase letter";
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return "Password must include a number";
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a special character";
  }
  return null;
}

export function formatSessionTimeout(minutes: number): string {
  if (minutes < 60) return `${minutes} Minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 Hour" : `${hours} Hours`;
}

export function describePasswordPolicy(policy: PasswordPolicy): string {
  const parts = [`Min ${policy.minLength} chars`];
  if (policy.requireUppercase) parts.push("uppercase");
  if (policy.requireLowercase) parts.push("lowercase");
  if (policy.requireNumber) parts.push("number");
  if (policy.requireSpecial) parts.push("special");
  return parts.join(" · ");
}
