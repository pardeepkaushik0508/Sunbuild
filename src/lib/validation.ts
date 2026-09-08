import { z } from "zod";
import { ProjectStatus } from "@prisma/client";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const optionalEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""));

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .regex(/^[+\d][\d\s()-]{6,19}$/, "Enter a valid phone number");

export const optionalPhoneSchema = z
  .string()
  .trim()
  .regex(/^$|^[+\d][\d\s()-]{6,19}$/, "Enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const requiredText = (label: string, min = 1, max = 200) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} is too long`);

export const optionalText = (label: string, max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .optional()
    .or(z.literal(""));

export const positiveNumber = (label: string) =>
  z.coerce.number().positive(`${label} must be greater than 0`);

export const nonNegativeNumber = (label: string) =>
  z.coerce.number().min(0, `${label} cannot be negative`);

export const dateRequired = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} is invalid`);

export const leadFormSchema = z.object({
  firstName: requiredText("First name", 1, 80),
  lastName: requiredText("Last name", 1, 80),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  address: optionalText("Address", 300),
  notes: optionalText("Notes", 2000),
  status: requiredText("Status", 1, 40),
  assigneeId: z.string().optional().or(z.literal("")),
  estimatedValue: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || !Number.isNaN(Number(v)),
      "Estimated value must be a number"
    ),
  source: optionalText("Source", 120),
  nextAction: optionalText("Next action", 200),
  followUpAt: z.string().optional().or(z.literal("")),
});

export const salesFollowUpSchema = z.object({
  title: requiredText("Title", 1, 160),
  leadId: requiredText("Lead"),
  description: optionalText("Description", 2000),
  dueDate: dateRequired("Due date"),
  dueTime: z.string().optional().or(z.literal("")),
  priority: requiredText("Priority"),
  activityType: requiredText("Activity type", 1, 40),
  assigneeId: z.string().optional().or(z.literal("")),
});

export const proposalFormSchema = z.object({
  leadId: requiredText("Lead"),
  title: requiredText("Title", 1, 160),
  amount: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Number(v)), "Amount must be a number"),
  status: requiredText("Status", 1, 40),
  notes: optionalText("Notes", 2000),
});

export const taskFormSchema = z.object({
  projectId: requiredText("Project"),
  title: requiredText("Title", 1, 160),
  description: optionalText("Description", 2000),
  priority: requiredText("Priority"),
  dueDate: z.string().optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
});

export const invoiceFormSchema = z.object({
  projectId: requiredText("Project"),
  invoiceNumber: requiredText("Invoice number", 1, 60),
  amount: positiveNumber("Amount"),
  issueDate: dateRequired("Issue date"),
  dueDate: z.string().optional().or(z.literal("")),
  notes: optionalText("Notes", 2000),
  status: requiredText("Status"),
});

export const warrantyFormSchema = z.object({
  projectId: requiredText("Project"),
  category: requiredText("Category", 1, 80),
  title: requiredText("Title", 1, 160),
  description: requiredText("Description", 5, 4000),
});

export const contractReviewSchema = z.object({
  projectName: requiredText("Project name", 1, 160),
  buyerFirstName: requiredText("Buyer first name", 1, 80),
  buyerLastName: requiredText("Buyer last name", 1, 80),
  buyerEmail: optionalEmailSchema,
  buyerPhone: optionalPhoneSchema,
  municipalAddress: requiredText("Municipal address", 1, 300),
  purchasePrice: nonNegativeNumber("Purchase price").optional(),
});

export const rfiFormSchema = z.object({
  projectId: requiredText("Project"),
  title: requiredText("Title", 1, 160),
  question: requiredText("Question", 5, 4000),
  priority: requiredText("Priority"),
  dueDate: z.string().optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
});

export const changeOrderFormSchema = z.object({
  projectId: requiredText("Project"),
  title: requiredText("Title", 1, 160),
  description: optionalText("Description", 4000),
  amount: nonNegativeNumber("Amount"),
  reason: optionalText("Reason", 500),
});

export const configureProjectFormSchema = z.object({
  projectId: requiredText("Project"),
  name: requiredText("Project name", 1, 160),
  pmId: z.string().optional().or(z.literal("")),
  status: z.nativeEnum(ProjectStatus),
  progressPercent: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(100).optional()
  ),
  targetClosing: z.string().optional().or(z.literal("")),
  purchasePrice: z.preprocess((v) => {
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }, z.number().min(0, "Budget cannot be negative").optional()),
});

export function formDataToObject(form: FormData) {
  const obj: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") obj[key] = value;
  });
  return obj;
}

export function zodErrorMap(error: z.ZodError) {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}
