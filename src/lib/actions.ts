"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  ChangeOrderStatus,
  ContractStatus,
  InvoiceStatus,
  LeadStatus,
  PhotoVisibility,
  Priority,
  ProjectStatus,
  ProposalStatus,
  Role,
  RfiStatus,
  ScheduleStatus,
  SelectionPackageStatus,
  SelectionSectionStatus,
  TaskStatus,
  WarrantyStatus,
  CompletionDocStatus,
  DocumentVisibility,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { redirectWithToast } from "@/lib/flash-toast";
import {
  requireSession,
  assertProjectAccess,
  assertLeadAccess,
  assertContractAccess,
  assertCompanyUser,
  assertProjectSubcontractor,
} from "@/lib/session";
import {
  deleteUpload,
  saveCompanyUpload,
  saveUpload,
  storageMeta,
} from "@/lib/storage";
import {
  createNotificationOnce,
  notifyProjectManager,
  notifyProjectManagersOfDailyLog,
  revalidateNotificationInbox,
} from "@/lib/notifications";
import {
  assertPasswordMeetsPolicy,
  getPasswordPolicy,
} from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import {
  requireCapability,
  requireFinanceAccess,
  canInviteRole,
  isValidRole,
  canSetClientVisibility,
  requireClientHeroAccess,
} from "@/lib/authorization";
import { ForbiddenError, AppError, toSafeErrorMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  ACTION_RATE,
  UPLOAD_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";
import { nanoid } from "nanoid";
import {
  formDataToObject,
  invoiceFormSchema,
  leadFormSchema,
  rfiFormSchema,
  taskFormSchema,
  taskUpdateFormSchema,
  warrantyFormSchema,
  changeOrderFormSchema,
  configureProjectFormSchema,
} from "@/lib/validation";
import { revalidateJobsSurfaces } from "@/lib/jobs/revalidate-jobs";
import {
  syncProjectProgress,
  revalidateProjectProgressSurfaces,
} from "@/lib/dashboard/sync-project-progress";
import { collectUploadFiles } from "@/lib/media/collect-upload-files";
import {
  getHeroImageFile,
  saveProjectHeroImage,
  clearProjectHeroImage,
} from "@/lib/projects/hero-image";
import { revalidateProjectPhotos, revalidateProjectSelections } from "@/lib/photos/revalidate";
import { isSectionClientVisible } from "@/lib/selections/query";

function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function rateLimitAction(userId: string, kind: string, upload = false) {
  const h = await headers();
  const cfg = upload ? UPLOAD_RATE : ACTION_RATE;
  assertRateLimit(
    clientKeyFromHeaders(h, `${kind}:${userId}`),
    cfg.limit,
    cfg.windowMs
  );
}

export async function createLeadAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageLeads");
  await rateLimitAction(session.user.id, "lead-create");
  const parsed = leadFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid lead data");
  }
  const data = parsed.data;

  if (data.assigneeId) {
    await assertCompanyUser(session, data.assigneeId);
  }

  const assigneeId =
    data.assigneeId ||
    (session.membership.role === Role.SALES_MANAGER ? session.user.id : null);

  const lead = await prisma.lead.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
      assigneeId,
      status: (data.status || "NEW") as LeadStatus,
      estimatedValue: data.estimatedValue
        ? Number(data.estimatedValue)
        : null,
      source: data.source || null,
      nextAction: data.nextAction || null,
      followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
      companyId: session.membership.companyId,
      createdById: session.user.id,
      activities: {
        create: {
          userId: session.user.id,
          type: "STATUS",
          title: "Lead created",
          content: `Lead created with status ${(data.status || "NEW").replace(/_/g, " ")}.`,
          activityDate: new Date(),
        },
      },
    },
  });
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "LEAD_CREATED",
    entityType: "Lead",
    entityId: lead.id,
  });
  revalidatePath("/sales");
  revalidatePath("/sales/leads");
  revalidatePath("/sales/activities");
  return { ok: true as const, id: lead.id };
}

export async function updateLeadAction(leadId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageLeads");
  await rateLimitAction(session.user.id, "lead-update");
  await assertLeadAccess(session, leadId);

  const existing = await prisma.lead.findFirst({
    where: { id: leadId, companyId: session.membership.companyId },
  });
  if (!existing) throw new AppError("Lead not found");

  const assigneeId = formString(form, "assigneeId") || null;
  if (assigneeId) await assertCompanyUser(session, assigneeId);

  const status = formString(form, "status") as LeadStatus;
  const estimatedRaw = formString(form, "estimatedValue");
  const estimatedValue =
    estimatedRaw.trim() === "" ? null : Number(estimatedRaw);
  if (estimatedValue != null && Number.isNaN(estimatedValue)) {
    throw new AppError("Estimated value must be a number");
  }
  const followUpRaw = formString(form, "followUpAt");
  const flaggedForFollowUp = formString(form, "flaggedForFollowUp") === "on";

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        firstName: formString(form, "firstName"),
        lastName: formString(form, "lastName"),
        email: formString(form, "email") || null,
        phone: formString(form, "phone") || null,
        address: formString(form, "address") || null,
        notes: formString(form, "notes") || null,
        status,
        assigneeId,
        estimatedValue,
        source: formString(form, "source") || null,
        nextAction: formString(form, "nextAction") || null,
        followUpAt: followUpRaw ? new Date(followUpRaw) : null,
        lastContactAt: formString(form, "lastContactAt")
          ? new Date(formString(form, "lastContactAt"))
          : existing.lastContactAt,
        flaggedForFollowUp,
      },
    });

    if (existing.status !== status) {
      await tx.leadActivity.create({
        data: {
          leadId,
          userId: session.user.id,
          type: "STATUS",
          title: "Status changed",
          content: `Status changed from ${existing.status.replace(/_/g, " ")} to ${status.replace(/_/g, " ")}.`,
          activityDate: new Date(),
        },
      });
    }

    if (existing.assigneeId !== assigneeId) {
      await tx.leadActivity.create({
        data: {
          leadId,
          userId: session.user.id,
          type: "STATUS",
          title: "Assignment updated",
          content: assigneeId
            ? "Lead assigned to a sales team member."
            : "Lead unassigned.",
          activityDate: new Date(),
        },
      });
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "LEAD_UPDATED",
    entityType: "Lead",
    entityId: leadId,
  });
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/leads");
  revalidatePath("/sales");
  revalidatePath("/sales/activities");
}

export async function addLeadNoteAction(leadId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageLeads");
  await rateLimitAction(session.user.id, "lead-note");
  await assertLeadAccess(session, leadId);
  const content = formString(form, "content");
  if (!content) throw new AppError("Note required");
  const type = formString(form, "type") || "NOTE";
  const title = formString(form, "title") || null;
  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: session.user.id,
      content,
      type,
      title,
      activityDate: new Date(),
    },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastContactAt: new Date() },
  });
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales");
  revalidatePath("/sales/activities");
}

export async function createProposalAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageLeads");
  await rateLimitAction(session.user.id, "lead-update");

  const leadId = formString(form, "leadId");
  const title = formString(form, "title");
  if (!leadId) throw new AppError("Lead is required");
  if (!title) throw new AppError("Title is required");
  await assertLeadAccess(session, leadId);

  const amountRaw = formString(form, "amount");
  const amount = amountRaw.trim() === "" ? null : Number(amountRaw);
  if (amount != null && Number.isNaN(amount)) {
    throw new AppError("Amount must be a number");
  }

  const status = (formString(form, "status") || ProposalStatus.DRAFT) as ProposalStatus;
  const notes = formString(form, "notes") || null;

  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        companyId: session.membership.companyId,
        leadId,
        title,
        amount,
        status,
        notes,
        sentAt: status === ProposalStatus.SENT ? new Date() : null,
        createdById: session.user.id,
      },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: {
        status:
          status === ProposalStatus.ACCEPTED
            ? LeadStatus.WON
            : LeadStatus.PROPOSAL,
        estimatedValue: amount ?? undefined,
        nextAction:
          status === ProposalStatus.SENT
            ? "Awaiting proposal response"
            : "Proposal in draft",
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId,
        userId: session.user.id,
        type: "PROPOSAL",
        title: `Proposal ${status === ProposalStatus.SENT ? "sent" : "created"}`,
        content: `${title}${amount != null ? ` · ${amount}` : ""}`,
        activityDate: new Date(),
      },
    });

    return created;
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "PROPOSAL_CREATED",
    entityType: "Proposal",
    entityId: proposal.id,
  });

  revalidatePath("/sales");
  revalidatePath("/sales/proposals");
  revalidatePath("/sales/leads");
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/activities");
  redirect("/sales/proposals");
}

export async function convertLeadAction(leadId: string) {
  const session = await requireSession();
  requireCapability(session, "manageLeads");
  await rateLimitAction(session.user.id, "lead-convert");
  await assertLeadAccess(session, leadId);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, companyId: session.membership.companyId },
  });
  if (!lead) throw new AppError("Lead not found");
  if (lead.projectId || lead.status === LeadStatus.WON || lead.convertedAt) {
    throw new AppError("Lead has already been converted to a project");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Conditional update prevents concurrent duplicate conversions.
    const claimed = await tx.lead.updateMany({
      where: {
        id: leadId,
        companyId: session.membership.companyId,
        projectId: null,
        status: { not: LeadStatus.WON },
      },
      data: {
        status: LeadStatus.WON,
        convertedAt: new Date(),
        lastContactAt: new Date(),
        flaggedForFollowUp: false,
        nextAction: null,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError("Lead has already been converted to a project");
    }

    const buyer = await tx.buyer.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        mailingAddress: lead.address,
      },
    });

    const project = await tx.project.create({
      data: {
        companyId: session.membership.companyId,
        name: `${lead.lastName} Residence`,
        municipalAddress: lead.address,
        buyerId: buyer.id,
        status: ProjectStatus.PRE_CONSTRUCTION,
      },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: { projectId: project.id },
    });

    await tx.leadActivity.create({
      data: {
        leadId,
        userId: session.user.id,
        type: "STATUS",
        title: "Deal closed won",
        content: `Lead converted to project ${project.name}.`,
        activityDate: new Date(),
      },
    });

    return project;
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: result.id,
    action: "LEAD_CONVERTED",
    entityType: "Lead",
    entityId: leadId,
  });

  revalidateJobsSurfaces(result.id);
  revalidatePath("/sales");
  revalidatePath("/sales/leads");
  revalidatePath("/sales/reports");
  revalidatePath("/sales/activities");
  redirect(`/pm/contracts/new?projectId=${result.id}`);
}

export async function uploadContractAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimitAction(session.user.id, "contract-upload", true);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("PDF file required");
  }

  const saved = await saveCompanyUpload(
    session.membership.companyId,
    file,
    "contracts"
  );
  const projectId = formString(form, "projectId") || null;

  if (projectId) await assertProjectAccess(session, projectId);

  let contract;
  try {
    contract = await prisma.purchaseContract.create({
      data: {
        projectId,
        ...storageMeta(saved),
        status: ContractStatus.IN_REVIEW,
        uploadedById: session.user.id,
        projectName: formString(form, "projectName") || null,
        municipalAddress: formString(form, "municipalAddress") || null,
        legalAddress: formString(form, "legalAddress") || null,
        lotBlockPlan: formString(form, "lotBlockPlan") || null,
        buyerFirstName: formString(form, "buyerFirstName") || null,
        buyerLastName: formString(form, "buyerLastName") || null,
        buyerEmail: formString(form, "buyerEmail") || null,
        buyerPhone: formString(form, "buyerPhone") || null,
        buyerMailing: formString(form, "buyerMailing") || null,
        contractNumber: formString(form, "contractNumber") || null,
        purchasePrice: Number(formString(form, "purchasePrice") || 0) || null,
        contractDate: formString(form, "contractDate")
          ? new Date(formString(form, "contractDate"))
          : null,
        targetClosing: formString(form, "targetClosing")
          ? new Date(formString(form, "targetClosing"))
          : null,
        builderName: formString(form, "builderName") || "Sunview Custom Homes",
        reviewNotes: formString(form, "reviewNotes") || null,
      },
    });
  } catch (err) {
    await deleteUpload(saved.filePath, {
      publicId: saved.publicId,
      resourceType: saved.resourceType,
    });
    throw err;
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "CONTRACT_UPLOADED",
    entityType: "PurchaseContract",
    entityId: contract.id,
  });

  await redirectWithToast(
    `/pm/contracts/${contract.id}`,
    "Contract uploaded successfully"
  );
}

export async function updateContractReviewAction(contractId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimitAction(session.user.id, "contract-review");
  await assertContractAccess(session, contractId);

  await prisma.purchaseContract.update({
    where: { id: contractId },
    data: {
      projectName: formString(form, "projectName") || null,
      municipalAddress: formString(form, "municipalAddress") || null,
      legalAddress: formString(form, "legalAddress") || null,
      lotBlockPlan: formString(form, "lotBlockPlan") || null,
      buyerFirstName: formString(form, "buyerFirstName") || null,
      buyerLastName: formString(form, "buyerLastName") || null,
      buyerEmail: formString(form, "buyerEmail") || null,
      buyerPhone: formString(form, "buyerPhone") || null,
      buyerMailing: formString(form, "buyerMailing") || null,
      contractNumber: formString(form, "contractNumber") || null,
      purchasePrice: Number(formString(form, "purchasePrice") || 0) || null,
      contractDate: formString(form, "contractDate")
        ? new Date(formString(form, "contractDate"))
        : null,
      targetClosing: formString(form, "targetClosing")
        ? new Date(formString(form, "targetClosing"))
        : null,
      builderName: formString(form, "builderName") || null,
      reviewNotes: formString(form, "reviewNotes") || null,
      status: ContractStatus.IN_REVIEW,
    },
  });
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "CONTRACT_REVIEW_UPDATED",
    entityType: "PurchaseContract",
    entityId: contractId,
  });
  revalidatePath(`/pm/contracts/${contractId}`);
}

export async function confirmContractAction(contractId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageContracts");
  await rateLimitAction(session.user.id, "contract-confirm");
  const contract = await assertContractAccess(session, contractId);

  if (contract.status === ContractStatus.CONFIRMED) {
    if (contract.projectId) {
      redirect(`/pm/projects/${contract.projectId}`);
    }
    throw new AppError("Contract is already confirmed");
  }
  if (
    contract.status !== ContractStatus.IN_REVIEW &&
    contract.status !== ContractStatus.UPLOADED
  ) {
    throw new AppError("Contract is not ready to confirm");
  }

  // PMs must own the job they create — empty assign defaults to the confirmer.
  let pmId = formString(form, "pmId") || null;
  if (!pmId && session.membership.role === Role.PROJECT_MANAGER) {
    pmId = session.user.id;
  }
  if (pmId) await assertCompanyUser(session, pmId);

  const createClientPortal = formString(form, "createClientPortal") === "1";
  const clientLoginEmail = formString(form, "clientLoginEmail").toLowerCase();
  const clientPassword = formString(form, "clientPassword");
  const clientPasswordConfirm = formString(form, "clientPasswordConfirm");

  const resolvedClientEmail = createClientPortal
    ? (clientLoginEmail || (contract.buyerEmail || "").toLowerCase())
    : "";
  if (createClientPortal) {
    if (!resolvedClientEmail) {
      throw new AppError("Client email is required to create a client login");
    }
    if (!clientPassword) {
      throw new AppError("Client password is required");
    }
    if (clientPassword !== clientPasswordConfirm) {
      throw new AppError("Client passwords do not match");
    }
    const passwordPolicy = await getPasswordPolicy(
      session.membership.companyId
    );
    const policyError = assertPasswordMeetsPolicy(
      clientPassword,
      passwordPolicy
    );
    if (policyError) throw new AppError(policyError);
  }

  // If contract already linked to a project, verify access (already done) and
  // never allow retargeting to an arbitrary projectId from the client.
  let projectId = contract.projectId;

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.purchaseContract.updateMany({
      where: {
        id: contractId,
        status: { in: [ContractStatus.IN_REVIEW, ContractStatus.UPLOADED] },
      },
      data: {
        status: ContractStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new AppError("Contract is already confirmed");
    }
    let buyerId = contract.buyerId;
    if (!buyerId && contract.buyerFirstName && contract.buyerLastName) {
      const buyer = await tx.buyer.create({
        data: {
          firstName: contract.buyerFirstName,
          lastName: contract.buyerLastName,
          email: resolvedClientEmail || contract.buyerEmail,
          phone: contract.buyerPhone,
          mailingAddress: contract.buyerMailing,
        },
      });
      buyerId = buyer.id;
    } else if (buyerId && createClientPortal && resolvedClientEmail) {
      await tx.buyer.update({
        where: { id: buyerId },
        data: { email: resolvedClientEmail },
      });
    }

    async function ensurePmAccess(targetProjectId: string, userId: string) {
      await tx.projectAccess.upsert({
        where: { projectId_userId: { projectId: targetProjectId, userId } },
        update: { role: Role.PROJECT_MANAGER },
        create: {
          projectId: targetProjectId,
          userId,
          role: Role.PROJECT_MANAGER,
        },
      });
    }

    if (!projectId) {
      const project = await tx.project.create({
        data: {
          companyId: session.membership.companyId,
          name: contract.projectName || `${contract.buyerLastName || "New"} Project`,
          municipalAddress: contract.municipalAddress,
          legalAddress: contract.legalAddress,
          lotInfo: contract.lotBlockPlan,
          purchasePrice: contract.purchasePrice,
          contractDate: contract.contractDate,
          targetClosing: contract.targetClosing,
          buyerId,
          pmId,
          status: ProjectStatus.PRE_CONSTRUCTION,
        },
      });
      projectId = project.id;
      if (pmId) {
        await ensurePmAccess(projectId, pmId);
      }
      // Confirming PM always retains access even if another PM is assigned.
      if (
        session.membership.role === Role.PROJECT_MANAGER &&
        session.user.id !== pmId
      ) {
        await ensurePmAccess(projectId, session.user.id);
      }
    } else {
      const existing = await tx.project.findFirst({
        where: {
          id: projectId,
          companyId: session.membership.companyId,
        },
      });
      if (!existing) throw new ForbiddenError();

      await tx.project.update({
        where: { id: projectId },
        data: {
          name: contract.projectName || undefined,
          municipalAddress: contract.municipalAddress,
          legalAddress: contract.legalAddress,
          lotInfo: contract.lotBlockPlan,
          purchasePrice: contract.purchasePrice,
          contractDate: contract.contractDate,
          targetClosing: contract.targetClosing,
          buyerId: buyerId || undefined,
          pmId: pmId || undefined,
        },
      });
      if (pmId && existing.pmId && existing.pmId !== pmId) {
        await tx.projectAccess.deleteMany({
          where: {
            projectId,
            userId: existing.pmId,
            role: Role.PROJECT_MANAGER,
          },
        });
      }
      if (pmId) {
        await ensurePmAccess(projectId, pmId);
      }
    }

    for (let i = 1; i <= 3; i++) {
      const amount = Number(formString(form, `depositAmount${i}`) || 0);
      const label = formString(form, `depositLabel${i}`) || "Client Deposit";
      if (amount > 0) {
        await tx.deposit.create({
          data: {
            projectId: projectId!,
            contractId,
            label,
            amount,
            dueDate: formString(form, `depositDue${i}`)
              ? new Date(formString(form, `depositDue${i}`))
              : null,
          },
        });
      }
    }

    const conditionTitle = formString(form, "conditionTitle");
    if (conditionTitle) {
      await tx.condition.create({
        data: {
          projectId: projectId!,
          contractId,
          title: conditionTitle,
          dueDate: formString(form, "conditionDue")
            ? new Date(formString(form, "conditionDue"))
            : null,
        },
      });
    }

    await tx.purchaseContract.update({
      where: { id: contractId },
      data: {
        projectId,
        buyerId,
        ...(createClientPortal && resolvedClientEmail
          ? { buyerEmail: resolvedClientEmail }
          : {}),
      },
    });

    let clientUserId: string | null = null;
    if (createClientPortal) {
      const email = resolvedClientEmail;
      const name = [contract.buyerFirstName, contract.buyerLastName]
        .filter(Boolean)
        .join(" ")
        .trim() || email.split("@")[0];
      const companyId = session.membership.companyId;
      const { hashPassword } = await import("better-auth/crypto");

      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name,
            phone: contract.buyerPhone || null,
            emailVerified: true,
            isActive: true,
          },
        });
        await tx.account.create({
          data: {
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: await hashPassword(clientPassword),
          },
        });
      } else {
        const existingClient = await tx.membership.findFirst({
          where: {
            userId: user.id,
            companyId,
            role: Role.CLIENT,
          },
        });
        const otherMembership = await tx.membership.findFirst({
          where: {
            userId: user.id,
            companyId,
            role: { not: Role.CLIENT },
          },
        });
        if (otherMembership && !existingClient) {
          throw new AppError(
            "This email already belongs to a non-client user in the company"
          );
        }
        const hashed = await hashPassword(clientPassword);
        const existingAcct = await tx.account.findFirst({
          where: { userId: user.id, providerId: "credential" },
        });
        if (existingAcct) {
          await tx.account.update({
            where: { id: existingAcct.id },
            data: { password: hashed },
          });
        } else {
          await tx.account.create({
            data: {
              userId: user.id,
              accountId: user.id,
              providerId: "credential",
              password: hashed,
            },
          });
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            name,
            phone: contract.buyerPhone || user.phone,
            isActive: true,
          },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
      }

      const flags = membershipFlagsForRole(Role.CLIENT);
      await tx.membership.upsert({
        where: {
          userId_companyId_role: {
            userId: user.id,
            companyId,
            role: Role.CLIENT,
          },
        },
        update: { isActive: true, ...flags },
        create: {
          userId: user.id,
          companyId,
          role: Role.CLIENT,
          isActive: true,
          ...flags,
        },
      });

      await tx.projectAccess.upsert({
        where: {
          projectId_userId: { projectId: projectId!, userId: user.id },
        },
        update: { role: Role.CLIENT, canEdit: false },
        create: {
          projectId: projectId!,
          userId: user.id,
          role: Role.CLIENT,
          canEdit: false,
        },
      });

      if (buyerId) {
        await tx.buyer.update({
          where: { id: buyerId },
          data: { userId: user.id, email },
        });
      }

      clientUserId = user.id;
    }

    return {
      projectId: projectId!,
      clientUserId,
      clientEmail: createClientPortal ? resolvedClientEmail || null : null,
    };
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: result.projectId,
    action: "CONTRACT_CONFIRMED",
    entityType: "PurchaseContract",
    entityId: contractId,
    metadata: {
      clientUserId: result.clientUserId,
      clientPortal: Boolean(result.clientUserId),
    },
  });

  if (result.clientUserId) {
    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      projectId: result.projectId,
      action: "USER_INVITED",
      entityType: "User",
      entityId: result.clientUserId,
      metadata: {
        email: result.clientEmail,
        role: Role.CLIENT,
        source: "contract_confirm",
      },
    });
  }

  const heroFile = getHeroImageFile(form);
  if (heroFile) {
    try {
      await saveProjectHeroImage({
        session,
        projectId: result.projectId,
        file: heroFile,
      });
    } catch (err) {
      console.error("[contract-confirm] hero image failed", err);
      revalidateJobsSurfaces(result.projectId);
      revalidatePath("/client");
      revalidatePath("/owner/users");
      await redirectWithToast(
        `/pm/projects/${result.projectId}`,
        "Project created, but the home banner did not upload. You can add it on the project page."
      );
    }
  }

  revalidateJobsSurfaces(result.projectId);
  revalidatePath("/client");
  revalidatePath("/owner/users");

  const toastMsg = result.clientUserId
    ? `Project created. Client can log in with ${result.clientEmail}.`
    : "Project created successfully";

  await redirectWithToast(`/pm/projects/${result.projectId}`, toastMsg);
}

export async function createTaskAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageTasks");
  await rateLimitAction(session.user.id, "task-create");
  const parsed = taskFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid task data");
  }
  const data = parsed.data;
  await assertProjectAccess(session, data.projectId);
  if (data.assigneeId) {
    await assertProjectSubcontractor(session, data.assigneeId, data.projectId);
  }

  const task = await prisma.task.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      priority: (data.priority || "MEDIUM") as Priority,
      status: TaskStatus.TODO,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      assigneeId: data.assigneeId || null,
      createdById: session.user.id,
    },
  });

  // Push dated tasks to Google: assignee → creator → session (first with connection).
  if (task.dueDate) {
    const { syncTaskToGoogle } = await import("@/lib/google/sync");
    await syncTaskToGoogle({
      companyId: session.membership.companyId,
      taskId: task.id,
      preferredUserIds: [task.assigneeId, session.user.id],
    });
  }

  await syncProjectProgress(task.projectId);
  revalidateProjectProgressSurfaces(task.projectId);
  if (task.assigneeId && task.assigneeId !== session.user.id) {
    try {
      const assigneeMembership = await prisma.membership.findFirst({
        where: {
          userId: task.assigneeId,
          companyId: session.membership.companyId,
          isActive: true,
        },
        select: { role: true },
      });
      await createNotificationOnce({
        userId: task.assigneeId,
        companyId: session.membership.companyId,
        type: "TASK_ASSIGNED",
        title: `Task assigned: ${task.title}`,
        body: `Assigned by ${session.user.name}.`,
        href:
          assigneeMembership?.role === Role.SUBCONTRACTOR
            ? `/sub/jobs/${task.projectId}`
            : `/pm/projects/${task.projectId}`,
        entityType: "Task",
        entityId: task.id,
      });
      revalidateNotificationInbox();
    } catch (err) {
      console.error("[task] assignment notification/SMS skipped", err);
    }
  }
  return task.id;
}

export async function updateTaskAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageTasks");
  await rateLimitAction(session.user.id, "task-update");
  const parsed = taskUpdateFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid task data");
  }
  const data = parsed.data;

  const existing = await prisma.task.findUnique({ where: { id: data.taskId } });
  if (!existing) throw new AppError("Task not found");

  await assertProjectAccess(session, existing.projectId);
  await assertProjectAccess(session, data.projectId);
  if (data.assigneeId) {
    await assertProjectSubcontractor(session, data.assigneeId, data.projectId);
  }

  if (!Object.values(Priority).includes(data.priority as Priority)) {
    throw new AppError("Invalid priority");
  }
  if (!Object.values(TaskStatus).includes(data.status as TaskStatus)) {
    throw new AppError("Invalid status");
  }

  const status = data.status as TaskStatus;
  const nextDue = data.dueDate ? new Date(data.dueDate) : null;
  const nextAssignee = data.assigneeId || null;

  const task = await prisma.task.update({
    where: { id: data.taskId },
    data: {
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      priority: data.priority as Priority,
      status,
      dueDate: nextDue,
      startDate: data.startDate ? new Date(data.startDate) : null,
      assigneeId: nextAssignee,
      completedAt:
        status === TaskStatus.DONE
          ? existing.completedAt ?? new Date()
          : null,
    },
  });

  if (task.dueDate) {
    const { syncTaskToGoogle } = await import("@/lib/google/sync");
    await syncTaskToGoogle({
      companyId: session.membership.companyId,
      taskId: task.id,
      preferredUserIds: [
        task.assigneeId,
        task.createdById,
        session.user.id,
      ],
    });
  }

  await syncProjectProgress(task.projectId);
  revalidateProjectProgressSurfaces(task.projectId);
  if (existing.projectId !== task.projectId) {
    await syncProjectProgress(existing.projectId);
    revalidateProjectProgressSurfaces(existing.projectId);
  }
  if (
    nextAssignee &&
    nextAssignee !== existing.assigneeId &&
    nextAssignee !== session.user.id
  ) {
    try {
      const assigneeMembership = await prisma.membership.findFirst({
        where: {
          userId: nextAssignee,
          companyId: session.membership.companyId,
          isActive: true,
        },
        select: { role: true },
      });
      await createNotificationOnce({
        userId: nextAssignee,
        companyId: session.membership.companyId,
        type: "TASK_ASSIGNED",
        title: `Task assigned: ${task.title}`,
        body: `Assigned by ${session.user.name}.`,
        href:
          assigneeMembership?.role === Role.SUBCONTRACTOR
            ? `/sub/jobs/${task.projectId}`
            : `/pm/projects/${task.projectId}`,
        entityType: "Task",
        entityId: task.id,
      });
      revalidateNotificationInbox();
    } catch (err) {
      console.error("[task] assignment notification/SMS skipped", err);
    }
  }
  return task.id;
}

export async function updateTaskStatusAction(taskId: string, status: TaskStatus) {
  const session = await requireSession();
  requireCapability(session, "updateOwnOrAssignedTasks");
  await rateLimitAction(session.user.id, "task-status");
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError("Not found");
  await assertProjectAccess(session, task.projectId);

  if (session.membership.role === Role.SUBCONTRACTOR) {
    if (task.assigneeId !== session.user.id) throw new ForbiddenError();
  }

  if (!Object.values(TaskStatus).includes(status)) {
    throw new AppError("Invalid status");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === TaskStatus.DONE ? new Date() : null,
    },
  });
  await syncProjectProgress(task.projectId);
  revalidateProjectProgressSurfaces(task.projectId);
}

export async function assignSubcontractorAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "assignSubcontractors");
  await rateLimitAction(session.user.id, "assign-sub");
  const projectId = formString(form, "projectId");
  const userId = formString(form, "userId");
  await assertProjectAccess(session, projectId);
  await assertCompanyUser(session, userId);

  const targetMembership = await prisma.membership.findFirst({
    where: {
      userId,
      companyId: session.membership.companyId,
      role: Role.SUBCONTRACTOR,
      isActive: true,
    },
  });
  if (!targetMembership) {
    throw new AppError("User must be a subcontractor in this company");
  }

  await prisma.projectAccess.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role: Role.SUBCONTRACTOR, canEdit: true },
    create: { projectId, userId, role: Role.SUBCONTRACTOR, canEdit: true },
  });
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "SUBCONTRACTOR_ASSIGNED",
    entityType: "ProjectAccess",
    entityId: userId,
  });
  revalidatePath(`/pm/projects/${projectId}`);
}

export async function createScheduleItemAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageSchedule");
  await rateLimitAction(session.user.id, "schedule");
  const projectId = formString(form, "projectId");
  await assertProjectAccess(session, projectId);
  const dependsOnId = formString(form, "dependsOnId") || null;
  const statusRaw = formString(form, "status") || "PLANNED";
  const title = formString(form, "title");
  if (!title) throw new AppError("Title is required");
  const startRaw = formString(form, "startDate");
  const endRaw = formString(form, "endDate");
  const startDate = startRaw ? new Date(startRaw) : null;
  const endDate = endRaw ? new Date(endRaw) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    throw new AppError("Valid start date is required");
  }
  if (!endDate || Number.isNaN(endDate.getTime())) {
    throw new AppError("Valid end date is required");
  }
  if (endDate.getTime() < startDate.getTime()) {
    throw new AppError("End date must be on or after start date");
  }
  const allowedStatuses = [
    ScheduleStatus.PLANNED,
    ScheduleStatus.IN_PROGRESS,
    ScheduleStatus.COMPLETED,
    ScheduleStatus.DELAYED,
  ] as const;
  const status = allowedStatuses.includes(statusRaw as ScheduleStatus)
    ? (statusRaw as ScheduleStatus)
    : ScheduleStatus.PLANNED;
  const location = formString(form, "location") || null;
  const syncFlag =
    formString(form, "syncToGoogle") === "on" ||
    formString(form, "syncToGoogle") === "true";
  const createMeet =
    formString(form, "createMeet") === "on" ||
    formString(form, "createMeet") === "true";

  const { userHasGoogleConnection, syncScheduleItemToGoogle } = await import(
    "@/lib/google/sync"
  );
  const googleConnected = await userHasGoogleConnection(
    session.user.id,
    session.membership.companyId
  );
  // Auto-sync when Google is connected; checkbox still forces an attempt.
  const syncToGoogle = syncFlag || googleConnected;

  const item = await prisma.scheduleItem.create({
    data: {
      projectId,
      title,
      trade: formString(form, "trade") || null,
      startDate,
      endDate,
      assigneeName: formString(form, "assigneeName") || null,
      dependsOnId,
      status,
      location,
      googleSyncStatus: syncToGoogle ? "SYNCING" : "LOCAL_ONLY",
    },
  });
  await syncProjectProgress(projectId);

  if (syncToGoogle) {
    await syncScheduleItemToGoogle({
      userId: session.user.id,
      companyId: session.membership.companyId,
      scheduleItemId: item.id,
      createMeet,
    });
  }

  revalidateScheduleSurfaces(projectId);
}

function revalidateScheduleSurfaces(projectId: string) {
  revalidateProjectProgressSurfaces(projectId);
}

export async function updateMilestoneStatusAction(
  milestoneId: string,
  status: ScheduleStatus
) {
  try {
    const session = await requireSession();
    requireCapability(session, "manageSchedule");
    await rateLimitAction(session.user.id, "milestone-status");

    if (!Object.values(ScheduleStatus).includes(status)) {
      throw new AppError("Invalid status");
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone) throw new AppError("Not found");
    await assertProjectAccess(session, milestone.projectId);

    await prisma.milestone.update({
      where: { id: milestoneId },
      data: { status },
    });
    await syncProjectProgress(milestone.projectId);
    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      projectId: milestone.projectId,
      action: "MILESTONE_STATUS_UPDATED",
      entityType: "Milestone",
      entityId: milestoneId,
      metadata: { status },
    });
    revalidateScheduleSurfaces(milestone.projectId);
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error("[milestone-status]", e);
    throw new AppError("Could not update milestone status. Please try again.");
  }
}

export async function updateScheduleItemStatusAction(
  scheduleItemId: string,
  status: ScheduleStatus
) {
  try {
    const session = await requireSession();
    requireCapability(session, "manageSchedule");
    await rateLimitAction(session.user.id, "schedule-status");

    if (!Object.values(ScheduleStatus).includes(status)) {
      throw new AppError("Invalid status");
    }

    const item = await prisma.scheduleItem.findUnique({
      where: { id: scheduleItemId },
    });
    if (!item) throw new AppError("Not found");
    await assertProjectAccess(session, item.projectId);

    await prisma.scheduleItem.update({
      where: { id: scheduleItemId },
      data: { status },
    });
    await syncProjectProgress(item.projectId);
    await writeAudit({
      userId: session.user.id,
      companyId: session.membership.companyId,
      projectId: item.projectId,
      action: "SCHEDULE_STATUS_UPDATED",
      entityType: "ScheduleItem",
      entityId: scheduleItemId,
      metadata: { status },
    });
    revalidateScheduleSurfaces(item.projectId);
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error("[schedule-status]", e);
    throw new AppError("Could not update schedule item status. Please try again.");
  }
}

export async function createRfiAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageRfis");
  await rateLimitAction(session.user.id, "rfi-create");
  const parsed = rfiFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid RFI data");
  }
  const data = parsed.data;
  await assertProjectAccess(session, data.projectId);
  if (data.assigneeId) await assertCompanyUser(session, data.assigneeId);

  const question =
    data.description && data.description.trim()
      ? `${data.question}\n\n${data.description.trim()}`
      : data.question;

  const rfi = await prisma.rFI.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      question,
      description: data.description || null,
      priority: (data.priority || "MEDIUM") as Priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assigneeId: data.assigneeId || null,
      createdById: session.user.id,
    },
  });

  const project = await prisma.project.findFirst({
    where: { id: data.projectId, companyId: session.membership.companyId },
    select: { name: true, pmId: true },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: data.projectId,
    action: "RFI_CREATED",
    entityType: "RFI",
    entityId: rfi.id,
  });

  try {
    await notifyProjectManager({
      projectId: data.projectId,
      companyId: session.membership.companyId,
      type: "RFI_CREATED",
      title: `New RFI: ${data.title}`,
      body: project
        ? `${session.user.name} submitted an RFI on ${project.name}.`
        : `${session.user.name} submitted an RFI.`,
      href: `/pm/rfis?projectId=${data.projectId}`,
      entityType: "RFI",
      entityId: rfi.id,
      excludeUserId: session.user.id,
    });
  } catch (err) {
    console.error("[rfi] PM notification/SMS skipped", err);
  }

  if (data.assigneeId && data.assigneeId !== session.user.id) {
    try {
      const assigneeMembership = await prisma.membership.findFirst({
        where: {
          userId: data.assigneeId,
          companyId: session.membership.companyId,
          isActive: true,
        },
        select: { role: true },
      });
      await createNotificationOnce({
        userId: data.assigneeId,
        companyId: session.membership.companyId,
        type: "RFI_ASSIGNED",
        title: `RFI assigned: ${data.title}`,
        body: project
          ? `${session.user.name} assigned an RFI on ${project.name}.`
          : `${session.user.name} assigned an RFI.`,
        href:
          assigneeMembership?.role === Role.SUBCONTRACTOR
            ? `/sub/rfis`
            : `/pm/rfis?projectId=${data.projectId}`,
        entityType: "RFI",
        entityId: rfi.id,
      });
    } catch (err) {
      console.error("[rfi] assignment notification/SMS skipped", err);
    }
  }

  revalidatePath("/pm/rfis");
  revalidatePath("/sub");
  revalidatePath("/sub/rfis");
  revalidatePath(`/sub/jobs/${data.projectId}`);
  revalidateNotificationInbox();
}

export async function answerRfiAction(rfiId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageRfis");
  await rateLimitAction(session.user.id, "rfi-answer");
  const rfi = await prisma.rFI.findUnique({ where: { id: rfiId } });
  if (!rfi) throw new AppError("Not found");
  await assertProjectAccess(session, rfi.projectId);

  if (
    session.membership.role === Role.SUBCONTRACTOR &&
    rfi.assigneeId !== session.user.id
  ) {
    throw new ForbiddenError();
  }

  await prisma.rFI.update({
    where: { id: rfiId },
    data: {
      response: formString(form, "response"),
      status: RfiStatus.ANSWERED,
      answeredAt: new Date(),
    },
  });
  revalidatePath("/pm/rfis");
  revalidatePath("/sub");
}

export async function createDailyLogAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "createDailyLog");
  await rateLimitAction(session.user.id, "daily-log");
  const projectId = formString(form, "projectId");
  if (!projectId) throw new AppError("Project is required");
  await assertProjectAccess(session, projectId);

  const logDateStr = formString(form, "logDate") || formString(form, "date");
  const logDate = logDateStr ? new Date(logDateStr) : new Date();
  const workCompleted = formString(form, "workCompleted");
  const siteNotes = formString(form, "siteNotes") || formString(form, "notes") || null;

  if (!workCompleted) {
    throw new AppError("Work completed description is required");
  }

  const photoFiles = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 10);

  const uploaded: Awaited<ReturnType<typeof saveCompanyUpload>>[] = [];
  let createdId: string | null = null;
  let projectName = "";
  try {
    for (const file of photoFiles) {
      const saved = await saveCompanyUpload(
        session.membership.companyId,
        file,
        `daily-logs/${projectId}`
      );
      uploaded.push(saved);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    projectName = project?.name ?? "Project";

    const created = await prisma.dailyLog.create({
      data: {
        projectId,
        authorId: session.user.id,
        logDate,
        workCompleted,
        siteNotes,
        status: "SUBMITTED",
        submittedAt: new Date(),
        photos: {
          create: uploaded.map((saved) => storageMeta(saved)),
        },
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (err) {
    for (const saved of uploaded) {
      await deleteUpload(saved.filePath, {
        publicId: saved.publicId,
        resourceType: saved.resourceType,
      });
    }
    throw err;
  }

  if (createdId) {
    try {
      await notifyProjectManagersOfDailyLog({
        projectId,
        companyId: session.membership.companyId,
        dailyLogId: createdId,
        authorName: session.user.name || "Subcontractor",
        projectName,
        excludeUserId: session.user.id,
      });
    } catch (err) {
      console.error("[daily-log] failed to notify project managers", err);
    }
  }

  revalidatePath("/pm/daily-logs");
  revalidatePath("/sub");
  revalidatePath("/sub/daily-logs");
  revalidatePath(`/sub/jobs/${projectId}`);
  revalidatePath("/notifications");
  if (createdId) {
    revalidatePath(`/sub/daily-logs/${createdId}`);
    revalidatePath(`/pm/daily-logs/${createdId}`);
    redirect(`/sub/daily-logs/${createdId}`);
  }
}

export async function uploadDocumentAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "uploadDocuments");
  await rateLimitAction(session.user.id, "doc-upload", true);
  const projectId = formString(form, "projectId");
  await assertProjectAccess(session, projectId);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new AppError("File required");
  const saved = await saveCompanyUpload(
    session.membership.companyId,
    file,
    `documents/${projectId}`
  );

  let visibility =
    (formString(form, "visibility") as DocumentVisibility) ||
    DocumentVisibility.INTERNAL;
  if (
    visibility === DocumentVisibility.CLIENT_VISIBLE &&
    !canSetClientVisibility(session.membership.role)
  ) {
    visibility = DocumentVisibility.INTERNAL;
  }
  if (!Object.values(DocumentVisibility).includes(visibility)) {
    visibility = DocumentVisibility.INTERNAL;
  }

  try {
    await prisma.document.create({
      data: {
        projectId,
        title: formString(form, "title") || saved.fileName,
        category: formString(form, "category") || "GENERAL",
        ...storageMeta(saved),
        visibility,
        uploadedById: session.user.id,
        notes: formString(form, "notes") || null,
      },
    });
  } catch (err) {
    await deleteUpload(saved.filePath, {
      publicId: saved.publicId,
      resourceType: saved.resourceType,
    });
    throw err;
  }
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: saved.filePath,
  });
  revalidatePath("/pm/documents");
  revalidatePath("/client/documents");
}

export async function uploadPhotoAction(form: FormData) {
  try {
    const session = await requireSession();
    requireCapability(session, "uploadPhotos");
    await rateLimitAction(session.user.id, "photo-upload", true);
    const projectId = formString(form, "projectId");
    if (!projectId) {
      return { error: "Please select a project." };
    }
    await assertProjectAccess(session, projectId);
    const files = collectUploadFiles(form);
    if (files.length === 0) {
      return { error: "Please select an image file to upload." };
    }

    // Default: PM/staff uploads are client-visible so they appear on the client portal.
    // Subcontractors remain INTERNAL until a PM publishes.
    const requested = formString(form, "visibility") as PhotoVisibility;
    let visibility: PhotoVisibility = PhotoVisibility.INTERNAL;

    const staffCanPublish =
      session.membership.role !== Role.SUBCONTRACTOR &&
      canSetClientVisibility(session.membership.role);

    if (staffCanPublish) {
      requireCapability(session, "publishPhotos");
      if (requested === PhotoVisibility.INTERNAL) {
        visibility = PhotoVisibility.INTERNAL;
      } else {
        visibility = PhotoVisibility.CLIENT_VISIBLE;
      }
    }

    const savedList: Awaited<ReturnType<typeof saveCompanyUpload>>[] = [];
    try {
      for (const file of files) {
        const saved = await saveCompanyUpload(
          session.membership.companyId,
          file,
          `photos/${projectId}`
        );
        savedList.push(saved);
        await prisma.photo.create({
          data: {
            projectId,
            ...storageMeta(saved),
            caption: formString(form, "caption") || null,
            visibility,
            uploadedById: session.user.id,
            publishedAt:
              visibility === PhotoVisibility.CLIENT_VISIBLE ? new Date() : null,
            publishedById:
              visibility === PhotoVisibility.CLIENT_VISIBLE
                ? session.user.id
                : null,
          },
        });
      }
    } catch (err) {
      for (const saved of savedList) {
        try {
          await deleteUpload(saved.filePath, {
            publicId: saved.publicId,
            resourceType: saved.resourceType,
          });
        } catch {
          // best-effort cleanup
        }
      }
      if (err instanceof AppError) return { error: err.message };
      console.error("[photo-upload] storage failed", err);
      return {
        error: "Failed to upload photo. Please check file storage configuration.",
      };
    }

    revalidateProjectPhotos(projectId);
    return { success: true };
  } catch (err) {
    if (err instanceof AppError) {
      return { error: err.message };
    }
    throw err;
  }
}

export async function updateProjectHeroImageAction(form: FormData) {
  try {
    const session = await requireSession();
    requireClientHeroAccess(session);
    await rateLimitAction(session.user.id, "hero-upload", true);
    const projectId = formString(form, "projectId");
    if (!projectId) return { error: "Project is required." };
    await assertProjectAccess(session, projectId);
    const file = getHeroImageFile(form);
    if (!file) {
      return { error: "Please select a house mockup image to upload." };
    }
    await saveProjectHeroImage({ session, projectId, file });
    return { success: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    throw err;
  }
}

export async function clearProjectHeroImageAction(form: FormData) {
  try {
    const session = await requireSession();
    requireClientHeroAccess(session);
    await rateLimitAction(session.user.id, "hero-remove");
    const projectId = formString(form, "projectId");
    if (!projectId) return { error: "Project is required." };
    await assertProjectAccess(session, projectId);
    await clearProjectHeroImage({ session, projectId });
    return { success: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    throw err;
  }
}

export async function publishPhotoAction(photoId: string) {
  const session = await requireSession();
  requireCapability(session, "publishPhotos");
  await rateLimitAction(session.user.id, "photo-publish");
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw new AppError("Not found");
  await assertProjectAccess(session, photo.projectId);
  await prisma.photo.update({
    where: { id: photoId },
    data: {
      visibility: PhotoVisibility.CLIENT_VISIBLE,
      publishedAt: new Date(),
      publishedById: session.user.id,
    },
  });
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: photo.projectId,
    action: "PHOTO_PUBLISHED",
    entityType: "Photo",
    entityId: photoId,
  });
  revalidateProjectPhotos(photo.projectId);
}

export async function deletePhotoAction(photoId: string) {
  const session = await requireSession();
  requireCapability(session, "uploadPhotos");
  await rateLimitAction(session.user.id, "photo-delete", true);
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw new AppError("Not found");
  await assertProjectAccess(session, photo.projectId);

  // Subs may only delete their own internal uploads
  if (
    session.membership.role === Role.SUBCONTRACTOR &&
    photo.uploadedById !== session.user.id
  ) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  await prisma.photo.delete({ where: { id: photo.id } });
  await deleteUpload(photo.filePath, {
    publicId: photo.storagePublicId,
    resourceType: photo.mediaResourceType || "image",
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: photo.projectId,
    action: "PHOTO_DELETED",
    entityType: "Photo",
    entityId: photoId,
  });
  revalidateProjectPhotos(photo.projectId);
}

export async function createSelectionPackageAction(projectId: string) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimitAction(session.user.id, "selection-pkg");
  await assertProjectAccess(session, projectId);
  const sections = [
    "Property Address / Interior Selections",
    "Tile & Grout – Flooring",
    "Tile & Grout – Walls",
    "Tile & Grout – Backsplash",
    "Carpet",
    "Laminate / Luxury Vinyl / Hardwood",
    "Fireplace",
    "Main Kitchen – Cabinetry",
    "Spice Kitchen – Cabinetry",
    "Primary Master Bathroom – Cabinetry",
    "Bathrooms & Laundry – Cabinetry",
    "Basement – Cabinetry",
    "Countertops",
    "Window Covering",
    "Finishing Material",
    "Paint",
    "Feature Wall",
    "Lighting Selections",
    "Plumbing Fixtures",
    "Built-in Closet Rendering",
    "Ceiling Texture",
    "Additional",
    "Notes / Considerations",
  ];
  const pkg = await prisma.selectionPackage.create({
    data: {
      projectId,
      status: SelectionPackageStatus.OPEN,
      sections: {
        create: sections.map((name, i) => ({
          name,
          sortOrder: i + 1,
          items: {
            create: [{ label: "Primary selection", sortOrder: 1 }],
          },
        })),
      },
    },
  });
  revalidateProjectSelections(projectId);
  return pkg.id;
}

export async function saveSelectionItemAction(itemId: string, form: FormData) {
  const session = await requireSession();
  await rateLimitAction(session.user.id, "selection-save");
  const item = await prisma.selectionItem.findUnique({
    where: { id: itemId },
    include: { section: { include: { package: true } } },
  });
  if (!item) throw new AppError("Not found");
  if (
    item.section.status === SelectionSectionStatus.LOCKED ||
    item.section.status === SelectionSectionStatus.APPROVED
  ) {
    throw new AppError("Section locked");
  }
  await assertProjectAccess(session, item.section.package.projectId);

  const role = session.membership.role;
  const canEdit =
    role === Role.CLIENT ||
    role === Role.PROJECT_MANAGER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.OWNER;
  if (!canEdit) throw new ForbiddenError();
  if (role === Role.CLIENT) {
    const visible = await isSectionClientVisible(item.section.id);
    if (!visible) throw new ForbiddenError();
  }

  const selectedCost = Number(formString(form, "selectedCost") || 0) || null;
  const allowanceAmount =
    Number(formString(form, "allowanceAmount") || 0) || item.allowanceAmount;
  const overage =
    selectedCost != null && allowanceAmount != null
      ? Math.max(0, selectedCost - allowanceAmount)
      : null;

  // Clients cannot change allowance amounts
  await prisma.selectionItem.update({
    where: { id: itemId },
    data: {
      optionValue: formString(form, "optionValue") || null,
      notes: formString(form, "notes") || null,
      selectedCost,
      allowanceAmount:
        role === Role.CLIENT ? item.allowanceAmount : allowanceAmount,
      overage,
    },
  });
  revalidatePath("/client/selections");
  revalidatePath("/pm/selections");
}

export async function submitSelectionSectionAction(sectionId: string) {
  const session = await requireSession();
  requireCapability(session, "clientSelections");
  await rateLimitAction(session.user.id, "selection-submit");
  if (session.membership.role !== Role.CLIENT) {
    throw new AppError("Only clients can submit selections");
  }
  const section = await prisma.selectionSection.findUnique({
    where: { id: sectionId },
    include: { package: true },
  });
  if (!section) throw new AppError("Not found");
  await assertProjectAccess(session, section.package.projectId);
  if (
    session.membership.role === Role.CLIENT &&
    !(await isSectionClientVisible(section.id))
  ) {
    throw new AppError("Not found");
  }
  if (
    section.status !== SelectionSectionStatus.DRAFT &&
    section.status !== SelectionSectionStatus.CHANGES_REQUESTED
  ) {
    throw new AppError("This selection cannot be submitted in its current state");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.selectionSection.updateMany({
      where: {
        id: sectionId,
        status: {
          in: [
            SelectionSectionStatus.DRAFT,
            SelectionSectionStatus.CHANGES_REQUESTED,
          ],
        },
      },
      data: { status: SelectionSectionStatus.SUBMITTED },
    });
    if (claimed.count !== 1) {
      throw new AppError("This selection was already submitted");
    }
    await tx.selectionPackage.update({
      where: { id: section.packageId },
      data: {
        status: SelectionPackageStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
    await tx.selectionApproval.create({
      data: {
        sectionId,
        userId: session.user.id,
        action: "SUBMITTED",
      },
    });
  });
  revalidatePath("/client/selections");
  revalidatePath("/pm/selections");
}

export async function reviewSelectionSectionAction(
  sectionId: string,
  action: "APPROVE" | "REQUEST_CHANGES",
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "manageSelectionsStaff");
  await rateLimitAction(session.user.id, "selection-review");
  if (action !== "APPROVE" && action !== "REQUEST_CHANGES") {
    throw new AppError("Invalid action");
  }
  const section = await prisma.selectionSection.findUnique({
    where: { id: sectionId },
    include: { package: true, items: true },
  });
  if (!section) throw new AppError("Not found");
  await assertProjectAccess(session, section.package.projectId);

  if (section.status !== SelectionSectionStatus.SUBMITTED) {
    throw new AppError("Only submitted selections can be reviewed");
  }

  if (action === "APPROVE") {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.selectionSection.updateMany({
        where: {
          id: sectionId,
          status: SelectionSectionStatus.SUBMITTED,
        },
        data: { status: SelectionSectionStatus.LOCKED },
      });
      if (claimed.count !== 1) {
        throw new AppError("Selection is no longer awaiting review");
      }

      // Prefer a single section-level overage CO when one already exists
      // from client approval; otherwise create per-item COs without duplicates.
      const totalOverage = section.items.reduce(
        (sum, item) => sum + (item.overage && item.overage > 0 ? item.overage : 0),
        0
      );
      if (totalOverage > 0) {
        const existing = await tx.changeOrder.findFirst({
          where: {
            projectId: section.package.projectId,
            reason: "Selection overage",
            title: `Overage: ${section.name}`,
            status: {
              in: [
                ChangeOrderStatus.DRAFT,
                ChangeOrderStatus.PENDING_CLIENT,
                ChangeOrderStatus.APPROVED,
              ],
            },
          },
        });
        if (!existing) {
          for (const item of section.items) {
            if (item.overage && item.overage > 0) {
              const itemExisting = await tx.changeOrder.findFirst({
                where: {
                  projectId: section.package.projectId,
                  relatedSelectionItemId: item.id,
                  reason: "Selection overage",
                  status: {
                    in: [
                      ChangeOrderStatus.DRAFT,
                      ChangeOrderStatus.PENDING_CLIENT,
                      ChangeOrderStatus.APPROVED,
                    ],
                  },
                },
              });
              if (!itemExisting) {
                await tx.changeOrder.create({
                  data: {
                    projectId: section.package.projectId,
                    title: `Overage: ${section.name}`,
                    description: item.optionValue || item.label,
                    amount: item.overage,
                    reason: "Selection overage",
                    status: ChangeOrderStatus.PENDING_CLIENT,
                    relatedSelectionItemId: item.id,
                    createdById: session.user.id,
                  },
                });
              }
            }
          }
        }
      }
      await tx.selectionApproval.create({
        data: {
          sectionId,
          userId: session.user.id,
          action,
          comment: formString(form, "comment") || null,
        },
      });
    });
  } else {
    await prisma.selectionSection.update({
      where: { id: sectionId },
      data: {
        status: SelectionSectionStatus.CHANGES_REQUESTED,
        notes: formString(form, "comment") || section.notes,
      },
    });
    await prisma.selectionApproval.create({
      data: {
        sectionId,
        userId: session.user.id,
        action,
        comment: formString(form, "comment") || null,
      },
    });
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: section.package.projectId,
    action: `SELECTION_${action}`,
    entityType: "SelectionSection",
    entityId: sectionId,
  });
  revalidatePath("/pm/selections");
  revalidatePath("/client/selections");
  revalidatePath("/pm/change-orders");
}

export async function createChangeOrderAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageChangeOrdersStaff");
  await rateLimitAction(session.user.id, "co-create");
  const parsed = changeOrderFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(
      parsed.error.issues[0]?.message || "Invalid change order data"
    );
  }
  const data = parsed.data;
  await assertProjectAccess(session, data.projectId);
  await prisma.changeOrder.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      amount: data.amount,
      scheduleImpact: data.scheduleImpact != null ? String(data.scheduleImpact) : null,
      budgetImpact: typeof data.budgetImpact === "number" ? data.budgetImpact : null,
      reason: data.reason || null,
      status: ChangeOrderStatus.PENDING_CLIENT,
      createdById: session.user.id,
      submittedAt: new Date(),
    },
  });
  revalidateJobsSurfaces(data.projectId);
  revalidatePath("/pm/change-orders");
  revalidatePath("/client");
  revalidatePath("/client/change-orders");
  revalidatePath("/client/payments");
}

export async function clientChangeOrderAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
  form: FormData
) {
  // Single entry point — delegates to the hardened client decision path.
  const { clientChangeOrderDecisionAction } = await import(
    "@/lib/client/actions"
  );
  return clientChangeOrderDecisionAction(id, decision, form);
}

export async function uploadInvoiceAction(form: FormData) {
  const session = await requireSession();
  requireFinanceAccess(session);
  await rateLimitAction(session.user.id, "invoice-upload", true);
  const parsed = invoiceFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid invoice data");
  }
  const data = parsed.data;
  await assertProjectAccess(session, data.projectId);
  const payeeUserId = data.payeeUserId || "";
  if (payeeUserId) {
    await assertProjectSubcontractor(session, payeeUserId, data.projectId);
  }
  const requestedStatus = (data.status as InvoiceStatus) || InvoiceStatus.SENT;
  // Creating as PAID/VOID would skip the real payment workflow — disallow on upload.
  const status =
    requestedStatus === InvoiceStatus.PAID ||
    requestedStatus === InvoiceStatus.VOID
      ? InvoiceStatus.SENT
      : requestedStatus;
  const file = form.get("file");
  let fileMeta: ReturnType<typeof storageMeta> | null = null;
  if (file instanceof File && file.size) {
    const saved = await saveCompanyUpload(
      session.membership.companyId,
      file,
      `invoices/${data.projectId}`
    );
    fileMeta = storageMeta(saved);
  }
  let invoice;
  try {
    invoice = await prisma.invoice.create({
      data: {
        projectId: data.projectId,
        invoiceNumber: data.invoiceNumber,
        amount: data.amount,
        issueDate: new Date(data.issueDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status,
        notes: data.notes || null,
        ...(fileMeta ?? { filePath: null, fileName: null }),
        uploadedById: session.user.id,
        payeeUserId: payeeUserId || null,
      },
    });
  } catch (err) {
    if (fileMeta?.storagePublicId) {
      await deleteUpload(fileMeta.filePath, {
        publicId: fileMeta.storagePublicId,
        resourceType: fileMeta.mediaResourceType,
      });
    }
    throw err;
  }
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: data.projectId,
    action: "INVOICE_UPLOADED",
    entityType: "Invoice",
    entityId: invoice.id,
  });
  revalidatePath("/bookkeeper/invoices");
  revalidatePath("/client/invoices");
  revalidatePath("/client/payments");
}

export async function updateInvoiceStatusAction(
  invoiceId: string,
  form: FormData
) {
  const session = await requireSession();
  requireFinanceAccess(session);
  await rateLimitAction(session.user.id, "invoice-status");
  const statusRaw = formString(form, "status");
  if (
    !Object.values(InvoiceStatus).includes(statusRaw as InvoiceStatus)
  ) {
    throw new AppError("Invalid invoice status");
  }
  const status = statusRaw as InvoiceStatus;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      projectId: true,
      status: true,
      invoiceNumber: true,
      amount: true,
    },
  });
  if (!invoice) throw new AppError("Invoice not found");
  await assertProjectAccess(session, invoice.projectId);

  if (status === InvoiceStatus.PAID) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        verifiedPaidAt: new Date(),
        verifiedById: session.user.id,
      },
    });
  } else {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status },
    });
  }
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: invoice.projectId,
    action:
      status === InvoiceStatus.PAID
        ? "INVOICE_PAYMENT_VERIFIED"
        : "INVOICE_STATUS_UPDATED",
    entityType: "Invoice",
    entityId: invoiceId,
    metadata: { from: invoice.status, to: status },
  });

  if (status === InvoiceStatus.PAID) {
    const project = await prisma.project.findFirst({
      where: { id: invoice.projectId },
      select: { name: true, buyer: { select: { userId: true } } },
    });
    if (project?.buyer?.userId) {
      await createNotificationOnce({
        userId: project.buyer.userId,
        companyId: session.membership.companyId,
        type: "PAYMENT_VERIFIED",
        title: `Payment verified — Invoice ${invoice.invoiceNumber}`,
        body: `${project.name}: ${invoice.amount.toFixed(2)} marked paid.`,
        href: "/client/payments",
        entityType: "Invoice",
        entityId: invoice.id,
      });
    }
  }

  revalidatePath("/bookkeeper/invoices");
  revalidatePath("/bookkeeper/payments");
  revalidatePath("/client/invoices");
  revalidatePath("/client/payments");
  revalidatePath("/client");
  revalidateNotificationInbox();
}

export async function reportInvoicePaidAction(invoiceId: string) {
  const session = await requireSession();
  if (session.membership.role !== Role.CLIENT) {
    throw new ForbiddenError("Only the client can report an external payment");
  }
  await rateLimitAction(session.user.id, "invoice-report-paid");
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          companyId: true,
          pmId: true,
        },
      },
    },
  });
  if (!invoice) throw new AppError("Invoice not found");
  if (invoice.project.companyId !== session.membership.companyId) {
    throw new ForbiddenError();
  }
  await assertProjectAccess(session, invoice.projectId);
  if (invoice.payeeUserId) {
    throw new ForbiddenError();
  }
  if (invoice.status === InvoiceStatus.PAID) {
    throw new AppError("This invoice is already paid");
  }
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
    throw new AppError("This invoice cannot be reported as paid");
  }
  if (invoice.status === InvoiceStatus.PAYMENT_REPORTED) {
    return { ok: true as const };
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        status: {
          in: [
            InvoiceStatus.SENT,
            InvoiceStatus.VIEWED,
            InvoiceStatus.OVERDUE,
          ],
        },
      },
      data: {
        status: InvoiceStatus.PAYMENT_REPORTED,
        reportedPaidAt: new Date(),
        reportedById: session.user.id,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError("This invoice can no longer be reported as paid");
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: invoice.projectId,
    action: "INVOICE_PAYMENT_REPORTED",
    entityType: "Invoice",
    entityId: invoiceId,
  });

  const bookkeepers = await prisma.membership.findMany({
    where: {
      companyId: session.membership.companyId,
      isActive: true,
      OR: [
        { role: Role.BOOKKEEPER },
        { role: Role.OWNER },
        { financeAccess: true },
      ],
    },
    select: { userId: true },
  });
  for (const row of bookkeepers) {
    if (row.userId === session.user.id) continue;
    await createNotificationOnce({
      userId: row.userId,
      companyId: session.membership.companyId,
      type: "PAYMENT_REPORTED",
      title: `Payment reported — Invoice ${invoice.invoiceNumber}`,
      body: `${session.user.name} reported paying ${invoice.amount.toFixed(2)} for ${invoice.project.name}.`,
      href: "/bookkeeper/payments",
      entityType: "Invoice",
      entityId: invoice.id,
    });
  }

  revalidatePath("/client/payments");
  revalidatePath("/client");
  revalidatePath("/bookkeeper/invoices");
  revalidatePath("/bookkeeper/payments");
  revalidateNotificationInbox();
  return { ok: true as const };
}

export async function verifyInvoicePaidAction(
  invoiceId: string,
  decision: "PAID" | "NEEDS_REVIEW"
) {
  const session = await requireSession();
  requireFinanceAccess(session);
  await rateLimitAction(session.user.id, "invoice-verify");
  if (decision !== "PAID" && decision !== "NEEDS_REVIEW") {
    throw new AppError("Invalid decision");
  }
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          companyId: true,
          buyer: { select: { userId: true } },
        },
      },
    },
  });
  if (!invoice) throw new AppError("Invoice not found");
  await assertProjectAccess(session, invoice.projectId);
  if (invoice.status !== InvoiceStatus.PAYMENT_REPORTED) {
    throw new AppError("Invoice is not awaiting verification");
  }

  const nextStatus =
    decision === "PAID" ? InvoiceStatus.PAID : InvoiceStatus.SENT;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.invoice.updateMany({
      where: { id: invoiceId, status: InvoiceStatus.PAYMENT_REPORTED },
      data: {
        status: nextStatus,
        verifiedPaidAt: decision === "PAID" ? new Date() : null,
        verifiedById: decision === "PAID" ? session.user.id : null,
        reportedPaidAt:
          decision === "PAID" ? invoice.reportedPaidAt : null,
        reportedById: decision === "PAID" ? invoice.reportedById : null,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError("Invoice is no longer awaiting verification");
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: invoice.projectId,
    action:
      decision === "PAID"
        ? "INVOICE_PAYMENT_VERIFIED"
        : "INVOICE_PAYMENT_NEEDS_REVIEW",
    entityType: "Invoice",
    entityId: invoiceId,
  });

  if (decision === "PAID" && invoice.project.buyer?.userId) {
    await createNotificationOnce({
      userId: invoice.project.buyer.userId,
      companyId: session.membership.companyId,
      type: "PAYMENT_VERIFIED",
      title: `Payment verified — Invoice ${invoice.invoiceNumber}`,
      body: `Your payment for ${invoice.project.name} has been verified.`,
      href: "/client/payments",
      entityType: "Invoice",
      entityId: invoice.id,
    });
  }

  revalidatePath("/bookkeeper/invoices");
  revalidatePath("/bookkeeper/payments");
  revalidatePath("/client/payments");
  revalidatePath("/client");
  revalidatePath("/owner/jobs");
  revalidateNotificationInbox();
}

export async function uploadCompletionDocumentAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "uploadCompletion");
  await rateLimitAction(session.user.id, "completion-upload", true);
  const projectId = formString(form, "projectId");
  await assertProjectAccess(session, projectId);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new AppError("File required");
  const saved = await saveCompanyUpload(
    session.membership.companyId,
    file,
    `completion/${projectId}`
  );
  const previous = await prisma.completionDocument.findUnique({
    where: { projectId },
    select: {
      filePath: true,
      storagePublicId: true,
      mediaResourceType: true,
    },
  });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.completionDocument.upsert({
        where: { projectId },
        update: {
          ...storageMeta(saved),
          status: CompletionDocStatus.PENDING_CEO_APPROVAL,
          uploadedById: session.user.id,
          reviewedAt: null,
          reviewedById: null,
          comments: null,
        },
        create: {
          projectId,
          ...storageMeta(saved),
          uploadedById: session.user.id,
        },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.PENDING_CEO_APPROVAL },
      });
    });
  } catch (err) {
    await deleteUpload(saved.filePath, {
      publicId: saved.publicId,
      resourceType: saved.resourceType,
    });
    throw err;
  }
  if (previous?.storagePublicId || previous?.filePath) {
    await deleteUpload(previous.filePath, {
      publicId: previous.storagePublicId,
      resourceType: previous.mediaResourceType,
    });
  }
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "COMPLETION_DOC_UPLOADED",
    entityType: "CompletionDocument",
    entityId: projectId,
  });
  revalidatePath("/ceo/approvals");
  revalidatePath(`/pm/projects/${projectId}`);
}

export async function ceoCompletionDecisionAction(
  projectId: string,
  decision: "APPROVED" | "REJECTED",
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "ceoApproveCompletion");
  await rateLimitAction(session.user.id, "ceo-decision");
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new AppError("Invalid decision");
  }
  await assertProjectAccess(session, projectId);

  const existing = await prisma.completionDocument.findUnique({
    where: { projectId },
  });
  if (!existing) throw new AppError("Not found");
  if (existing.status !== CompletionDocStatus.PENDING_CEO_APPROVAL) {
    throw new AppError("Completion document is not pending approval");
  }

  const comments = formString(form, "comments") || null;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.completionDocument.updateMany({
      where: {
        projectId,
        status: CompletionDocStatus.PENDING_CEO_APPROVAL,
      },
      data: {
        status:
          decision === "APPROVED"
            ? CompletionDocStatus.APPROVED
            : CompletionDocStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        comments,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError("Completion document is no longer pending approval");
    }

    if (decision === "APPROVED") {
      const warrantyStart = new Date();
      const warrantyEnd = new Date();
      warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 1);
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.COMPLETED,
          progressPercent: 100,
          warrantyStart,
          warrantyEnd,
        },
      });
    } else {
      await tx.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.SUBSTANTIAL_COMPLETION },
      });
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: `COMPLETION_${decision}`,
    entityType: "CompletionDocument",
    entityId: projectId,
    metadata: { comments },
  });

  if (decision === "APPROVED") {
    const project = await prisma.project.findFirst({
      where: { id: projectId },
      select: {
        name: true,
        pmId: true,
        companyId: true,
        buyer: { select: { userId: true } },
        access: {
          where: { role: Role.CLIENT },
          select: { userId: true },
        },
      },
    });
    if (project) {
      const recipients = new Set<string>();
      if (project.pmId) recipients.add(project.pmId);
      if (project.buyer?.userId) recipients.add(project.buyer.userId);
      for (const a of project.access) recipients.add(a.userId);
      for (const userId of recipients) {
        await createNotificationOnce({
          userId,
          companyId: session.membership.companyId,
          type: "WARRANTY_STARTED",
          title: `Warranty started — ${project.name}`,
          body: "The warranty period is now active for this home.",
          href:
            userId === project.pmId
              ? `/pm/warranty?projectId=${projectId}`
              : "/client/warranty",
          entityType: "Project",
          entityId: projectId,
        });
      }
    }
  }

  revalidatePath("/ceo/approvals");
  revalidatePath(`/pm/projects/${projectId}`);
  revalidatePath("/pm/projects");
  revalidatePath("/client");
  revalidatePath("/client/warranty");
  revalidatePath("/pm/warranty");
  revalidateNotificationInbox();
}

export async function createWarrantyTicketAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "createWarranty");
  await rateLimitAction(session.user.id, "warranty-create", true);
  const parsed = warrantyFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "Invalid warranty data");
  }
  const data = parsed.data;
  await assertProjectAccess(session, data.projectId);
  const project = await prisma.project.findFirst({
    where: {
      id: data.projectId,
      companyId: session.membership.companyId,
    },
  });
  if (!project?.warrantyStart) {
    throw new AppError("Warranty not active for this project");
  }
  if (project.warrantyEnd && project.warrantyEnd.getTime() < Date.now()) {
    throw new AppError("Warranty period has expired for this project");
  }
  const ticket = await prisma.warrantyTicket.create({
    data: {
      ticketNumber: `WT-${nanoid(8).toUpperCase()}`,
      projectId: data.projectId,
      clientUserId: session.user.id,
      category: data.category,
      title: data.title,
      description: data.description,
      status: WarrantyStatus.OPEN,
      pmId: project.pmId,
      eligible: true,
    },
  });

  const file = form.get("file");
  if (file instanceof File && file.size) {
    const saved = await saveCompanyUpload(
      session.membership.companyId,
      file,
      `warranty/${ticket.id}`
    );
    try {
      await prisma.warrantyPhoto.create({
        data: {
          ticketId: ticket.id,
          ...storageMeta(saved),
        },
      });
    } catch (err) {
      await deleteUpload(saved.filePath, {
        publicId: saved.publicId,
        resourceType: saved.resourceType,
      });
      throw err;
    }
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: data.projectId,
    action: "WARRANTY_CREATED",
    entityType: "WarrantyTicket",
    entityId: ticket.id,
  });

  await notifyProjectManager({
    projectId: data.projectId,
    companyId: session.membership.companyId,
    type: "WARRANTY_TICKET_CREATED",
    title: `Warranty ticket ${ticket.ticketNumber}`,
    body: `${session.user.name} submitted “${ticket.title}”.`,
    href: `/pm/warranty/${ticket.id}`,
    entityType: "WarrantyTicket",
    entityId: ticket.id,
    excludeUserId: session.user.id,
  });

  revalidatePath("/client/warranty");
  revalidatePath("/pm/warranty");
  revalidateNotificationInbox();
  redirect(`/client/warranty/${ticket.id}`);
}

export async function updateWarrantyStatusAction(ticketId: string, form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageWarranty");
  await rateLimitAction(session.user.id, "warranty-update");
  const ticket = await prisma.warrantyTicket.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) throw new AppError("Not found");
  await assertProjectAccess(session, ticket.projectId);
  const status = formString(form, "status") as WarrantyStatus;
  if (!Object.values(WarrantyStatus).includes(status)) {
    throw new AppError("Invalid status");
  }
  const subcontractorId =
    formString(form, "subcontractorId") || ticket.subcontractorId;
  if (subcontractorId && subcontractorId !== ticket.subcontractorId) {
    await assertCompanyUser(session, subcontractorId);
  }
  const previousSub = ticket.subcontractorId;
  const previousStatus = ticket.status;
  await prisma.warrantyTicket.update({
    where: { id: ticketId },
    data: {
      status,
      subcontractorId,
      resolution: formString(form, "resolution") || ticket.resolution,
      closedAt: status === WarrantyStatus.CLOSED ? new Date() : ticket.closedAt,
      clientRepliedAt:
        status === WarrantyStatus.CLOSED ? ticket.clientRepliedAt : ticket.clientRepliedAt,
    },
  });
  const comment = formString(form, "comment");
  if (comment) {
    await prisma.warrantyComment.create({
      data: { ticketId, userId: session.user.id, content: comment },
    });
  }
  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: ticket.projectId,
    action: "WARRANTY_STATUS_UPDATED",
    entityType: "WarrantyTicket",
    entityId: ticketId,
    metadata: { status, subcontractorId },
  });

  if (status !== previousStatus) {
    const clientId = ticket.clientUserId;
    if (clientId && clientId !== session.user.id) {
      await createNotificationOnce({
        userId: clientId,
        companyId: session.membership.companyId,
        type: "WARRANTY_STATUS_CHANGED",
        title: `Warranty ${ticket.ticketNumber} updated`,
        body: `Status is now ${status.replace(/_/g, " ")}.`,
        href: `/client/warranty/${ticketId}`,
        entityType: "WarrantyTicket",
        entityId: ticketId,
      });
    }
    await notifyProjectManager({
      projectId: ticket.projectId,
      companyId: session.membership.companyId,
      type: "WARRANTY_STATUS_CHANGED",
      title: `Warranty ${ticket.ticketNumber} updated`,
      body: `Status is now ${status.replace(/_/g, " ")}.`,
      href: `/pm/warranty/${ticketId}`,
      entityType: "WarrantyTicket",
      entityId: `${ticketId}:${status}`,
      excludeUserId: session.user.id,
      once: false,
    });
  }

  if (subcontractorId && subcontractorId !== previousSub) {
    await createNotificationOnce({
      userId: subcontractorId,
      companyId: session.membership.companyId,
      type: "WARRANTY_TICKET_ASSIGNED",
      title: `Warranty work assigned — ${ticket.ticketNumber}`,
      body: ticket.title,
      href: `/sub/warranty/${ticketId}`,
      entityType: "WarrantyTicket",
      entityId: ticketId,
    });
  }

  revalidatePath("/pm/warranty");
  revalidatePath(`/pm/warranty/${ticketId}`);
  revalidatePath(`/client/warranty/${ticketId}`);
  revalidatePath("/client/warranty");
  revalidateNotificationInbox();
}

export async function addWarrantyCommentAction(ticketId: string, form: FormData) {
  const session = await requireSession();
  await rateLimitAction(session.user.id, "warranty-comment");
  const content = formString(form, "content") || formString(form, "comment");
  if (!content) throw new AppError("Comment is required");

  const ticket = await prisma.warrantyTicket.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) throw new AppError("Not found");
  await assertProjectAccess(session, ticket.projectId);

  const role = session.membership.role;
  if (role === Role.CLIENT && ticket.clientUserId !== session.user.id) {
    throw new ForbiddenError();
  }
  if (ticket.status === WarrantyStatus.CLOSED && role === Role.CLIENT) {
    throw new AppError("This warranty ticket is closed");
  }

  await prisma.$transaction(async (tx) => {
    await tx.warrantyComment.create({
      data: { ticketId, userId: session.user.id, content },
    });
    if (role === Role.CLIENT && ticket.status === WarrantyStatus.RESOLVED) {
      await tx.warrantyTicket.update({
        where: { id: ticketId },
        data: { clientRepliedAt: new Date() },
      });
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: ticket.projectId,
    action: "WARRANTY_COMMENTED",
    entityType: "WarrantyTicket",
    entityId: ticketId,
  });

  if (role === Role.CLIENT) {
    await notifyProjectManager({
      projectId: ticket.projectId,
      companyId: session.membership.companyId,
      type: "WARRANTY_CLIENT_REPLIED",
      title: `Client replied on warranty ${ticket.ticketNumber}`,
      body: content.slice(0, 180),
      href: `/pm/warranty/${ticketId}`,
      entityType: "WarrantyTicket",
      entityId: `${ticketId}:comment:${Date.now()}`,
      once: false,
    });
  }

  revalidatePath(`/client/warranty/${ticketId}`);
  revalidatePath(`/pm/warranty/${ticketId}`);
  revalidatePath("/pm/warranty");
  revalidatePath("/client/warranty");
  revalidateNotificationInbox();
}

function revalidateUserSurfaces(projectIds: string[] = []) {
  revalidatePath("/owner/users");
  revalidatePath("/owner");
  revalidatePath("/owner/jobs");
  revalidatePath("/owner/permissions");
  revalidatePath("/admin");
  revalidatePath("/pm");
  revalidatePath("/pm/projects");
  revalidatePath("/sales/leads");
  for (const id of projectIds) {
    revalidatePath(`/pm/projects/${id}`);
  }
}

function membershipFlagsForRole(
  role: Role,
  matrix?: import("@/lib/permission-matrix").PermissionMatrixState | null
) {
  const matrixFinance =
    matrix &&
    role !== Role.OWNER &&
    role !== Role.CEO &&
    role !== Role.CLIENT &&
    role !== Role.SUBCONTRACTOR &&
    role in matrix.financialReport
      ? Boolean(
          matrix.financialReport[
            role as import("@/lib/permission-matrix").MatrixRole
          ]
        )
      : false;
  return {
    canEditSettings: role === Role.OPERATIONS_ADMIN || role === Role.OWNER,
    financeAccess:
      role === Role.BOOKKEEPER || role === Role.OWNER || matrixFinance,
  };
}

export async function inviteUserAction(form: FormData): Promise<
  | { ok: true; emailSent: boolean; emailMessage: string | null }
  | { ok: false; error: string }
> {
  try {
    const session = await requireSession();
    requireCapability(session, "manageUsers");
    await rateLimitAction(session.user.id, "invite");
    const email = formString(form, "email").toLowerCase();
    if (!email) {
      return { ok: false, error: "Email is required" };
    }
    const roleRaw = formString(form, "role");
    if (!isValidRole(roleRaw)) {
      return { ok: false, error: "Invalid role" };
    }
    const role = roleRaw as Role;
    if (!canInviteRole(session.membership.role, role)) {
      return { ok: false, error: "You cannot invite this role" };
    }
    const firstName = formString(form, "firstName");
    const lastName = formString(form, "lastName");
    const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const name =
      combinedName || formString(form, "name") || email.split("@")[0];
    const trade = formString(form, "trade") || null;
    const provided = formString(form, "tempPassword");
    const statusRaw = formString(form, "status");
    const createActive = statusRaw !== "INACTIVE";
    const projectIds = form
      .getAll("projectIds")
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const companyId = session.membership.companyId;

    // Fail fast with a clear message before creating anything
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findFirst({
        where: { userId: existingUser.id, companyId },
      });
      if (existingMembership) {
        return {
          ok: false,
          error:
            "A user with this email already exists. Please use a different email.",
        };
      }
    }

    if (projectIds.length > 0) {
      const valid = await prisma.project.count({
        where: { companyId, id: { in: projectIds } },
      });
      if (valid !== projectIds.length) {
        return { ok: false, error: "One or more projects are invalid" };
      }
    }

    const { hashPassword } = await import("better-auth/crypto");
    const passwordPolicy = await getPasswordPolicy(companyId);

    if (!existingUser) {
      const policyError = assertPasswordMeetsPolicy(provided, passwordPolicy);
      if (policyError) {
        return { ok: false, error: policyError };
      }
    } else if (provided.length > 0) {
      const policyError = assertPasswordMeetsPolicy(provided, passwordPolicy);
      if (policyError) {
        return { ok: false, error: policyError };
      }
    }

    const userId = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name,
            phone: formString(form, "phone") || null,
            trade: role === Role.SUBCONTRACTOR ? trade : null,
            emailVerified: true,
            isActive: createActive,
          },
        });
        await tx.account.create({
          data: {
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: await hashPassword(provided),
          },
        });
      } else {
        const existingMembership = await tx.membership.findFirst({
          where: { userId: user.id, companyId },
        });
        if (existingMembership) {
          throw new AppError(
            "A user with this email already exists. Please use a different email.",
            409,
            "USER_EXISTS"
          );
        }
        if (provided.length > 0) {
          await tx.account.updateMany({
            where: { userId: user.id, providerId: "credential" },
            data: { password: await hashPassword(provided) },
          });
          await tx.session.deleteMany({ where: { userId: user.id } });
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            name,
            phone: formString(form, "phone") || user.phone,
            trade:
              role === Role.SUBCONTRACTOR
                ? trade
                : role
                  ? null
                  : user.trade,
            isActive: createActive,
          },
        });
      }

      const flags = membershipFlagsForRole(
        role,
        session.membership.permissionMatrix
      );
      await tx.membership.upsert({
        where: {
          userId_companyId_role: {
            userId: user.id,
            companyId,
            role,
          },
        },
        update: { isActive: createActive, ...flags },
        create: {
          userId: user.id,
          companyId,
          role,
          isActive: createActive,
          ...flags,
        },
      });

      for (const projectId of projectIds) {
        await tx.projectAccess.upsert({
          where: {
            projectId_userId: { projectId, userId: user.id },
          },
          update: { role, canEdit: true },
          create: { projectId, userId: user.id, role, canEdit: true },
        });
        if (role === Role.PROJECT_MANAGER) {
          await tx.project.updateMany({
            where: { id: projectId, companyId, pmId: null },
            data: { pmId: user.id },
          });
        }
      }

      const token = nanoid(24);
      await tx.invitation.create({
        data: {
          email,
          role,
          companyId,
          token,
          invitedById: session.user.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });

      return user.id;
    });

    await writeAudit({
      userId: session.user.id,
      companyId,
      action: "USER_INVITED",
      entityType: "User",
      entityId: userId,
      metadata: { email, role, projectIds },
    });

    const heroFile = getHeroImageFile(form);
    if (role === Role.CLIENT && heroFile && projectIds.length > 0) {
      try {
        for (const projectId of projectIds) {
          await saveProjectHeroImage({ session, projectId, file: heroFile });
        }
      } catch (err) {
        console.error("[invite] hero image failed", err);
      }
    }

    revalidateUserSurfaces(projectIds);

    const { after } = await import("next/server");
    after(async () => {
      try {
        const {
          isEmailConfigured,
          accountCreatedEmail,
          trySendEmail,
          createPasswordSetupLink,
        } = await import("@/lib/email");
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true },
        });
        const { getAppOrigin } = await import("@/lib/app-url");
        const appUrl = getAppOrigin();
        let setupPasswordUrl: string | null = null;
        try {
          setupPasswordUrl = await createPasswordSetupLink(userId);
        } catch (linkError) {
          console.error("[invite] password setup link failed", {
            message: linkError instanceof Error ? linkError.message : "unknown",
          });
        }
        if (!isEmailConfigured()) {
          if (process.env.NODE_ENV !== "production" && setupPasswordUrl) {
            console.info(
              `[invite:dev] password setup URL for ${email}: ${setupPasswordUrl}`
            );
          }
          return;
        }
        const template = accountCreatedEmail({
          userName: name,
          companyName: company?.name || "Sunbuild",
          roleLabel: ROLE_LABELS[role] || role.replace(/_/g, " "),
          loginUrl: `${appUrl}/login`,
          invitedByName: session.user.name,
          setupPasswordUrl,
        });
        const mail = await trySendEmail({
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          tags: { type: "account_created", role },
        });
        if (!mail.success) {
          console.error("[invite] account email failed:", mail.message);
        }
      } catch (error) {
        console.error("[invite] account email unexpected error", {
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    });

    return {
      ok: true as const,
      emailSent: true,
      emailMessage: "User created successfully.",
    };
  } catch (e) {
    // Prisma unique race on email
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error:
          "A user with this email already exists. Please use a different email.",
      };
    }
    return { ok: false, error: toSafeErrorMessage(e) };
  }
}

export async function toggleUserActiveAction(userId: string, isActive: boolean) {
  const session = await requireSession();
  requireCapability(session, "manageUsers");
  await rateLimitAction(session.user.id, "toggle-user");

  // Must belong to same company
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      companyId: session.membership.companyId,
    },
  });
  if (!membership) throw new ForbiddenError();

  // Prevent self-deactivation lockout
  if (userId === session.user.id && !isActive) {
    throw new AppError("You cannot deactivate your own account");
  }

  // Prevent demoting the last owner via deactivation of other owners only when needed
  if (!isActive && membership.role === Role.OWNER) {
    const ownerCount = await prisma.membership.count({
      where: {
        companyId: session.membership.companyId,
        role: Role.OWNER,
        isActive: true,
        user: { isActive: true },
      },
    });
    if (ownerCount <= 1) {
      throw new AppError("Cannot deactivate the last active owner");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    if (!isActive) {
      // Revoke sessions immediately
      await tx.session.deleteMany({ where: { userId } });
      await tx.membership.updateMany({
        where: {
          userId,
          companyId: session.membership.companyId,
        },
        data: { isActive: false },
      });
    } else {
      await tx.membership.updateMany({
        where: {
          userId,
          companyId: session.membership.companyId,
        },
        data: { isActive: true },
      });
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: userId,
  });
  revalidateUserSurfaces();
}

export async function updateUserAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageUsers");
  await rateLimitAction(session.user.id, "update-user");

  const userId = formString(form, "userId");
  if (!userId) throw new AppError("User is required");

  const companyId = session.membership.companyId;
  const membership = await prisma.membership.findFirst({
    where: { userId, companyId },
    include: { user: true },
  });
  if (!membership) throw new ForbiddenError();

  const firstName = formString(form, "firstName");
  const lastName = formString(form, "lastName");
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const name = combinedName || formString(form, "name") || membership.user.name;
  const email = formString(form, "email").toLowerCase() || membership.user.email;
  const phone = formString(form, "phone");
  const trade = formString(form, "trade") || null;
  const roleRaw = formString(form, "role");
  const statusRaw = formString(form, "status");
  const projectIds = form
    .getAll("projectIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (email !== membership.user.email) {
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== userId) {
      throw new AppError("Email is already in use");
    }
  }

  let nextRole = membership.role;
  if (roleRaw) {
    if (!isValidRole(roleRaw)) throw new AppError("Invalid role");
    nextRole = roleRaw as Role;
    if (!canInviteRole(session.membership.role, nextRole)) {
      throw new ForbiddenError();
    }
    if (
      membership.role === Role.OWNER &&
      nextRole !== Role.OWNER &&
      userId === session.user.id
    ) {
      throw new AppError("You cannot demote your own owner role");
    }
    if (membership.role === Role.OWNER && nextRole !== Role.OWNER) {
      const ownerCount = await prisma.membership.count({
        where: {
          companyId,
          role: Role.OWNER,
          isActive: true,
          user: { isActive: true },
        },
      });
      if (ownerCount <= 1) {
        throw new AppError("Cannot demote the last active owner");
      }
    }
  }

  if (projectIds.length > 0) {
    const valid = await prisma.project.count({
      where: { companyId, id: { in: projectIds } },
    });
    if (valid !== projectIds.length) {
      throw new AppError("One or more projects are invalid");
    }
  }

  const setActive =
    statusRaw === "INACTIVE"
      ? false
      : statusRaw === "ACTIVE" || statusRaw === "INVITED"
        ? true
        : membership.user.isActive;

  if (userId === session.user.id && !setActive) {
    throw new AppError("You cannot deactivate your own account");
  }

  const previousProjectIds = (
    await prisma.projectAccess.findMany({
      where: { userId, project: { companyId } },
      select: { projectId: true },
    })
  ).map((p) => p.projectId);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        phone: phone || null,
        trade: nextRole === Role.SUBCONTRACTOR ? trade : null,
        isActive: setActive,
      },
    });

    if (nextRole !== membership.role) {
      await tx.membership.update({
        where: { id: membership.id },
        data: {
          role: nextRole,
          isActive: setActive,
          ...membershipFlagsForRole(nextRole),
        },
      });
    } else {
      await tx.membership.updateMany({
        where: { userId, companyId },
        data: { isActive: setActive },
      });
    }

    if (!setActive) {
      await tx.session.deleteMany({ where: { userId } });
    }

    // Sync project access when projectIds field is present in the form
    if (form.has("projectIds") || form.getAll("projectIds").length > 0 || form.get("syncProjects") === "1") {
      const existing = await tx.projectAccess.findMany({
        where: { userId, project: { companyId } },
        select: { projectId: true },
      });
      const existingIds = new Set(existing.map((e) => e.projectId));
      const nextIds = new Set(projectIds);

      for (const projectId of existingIds) {
        if (!nextIds.has(projectId)) {
          await tx.projectAccess.delete({
            where: { projectId_userId: { projectId, userId } },
          });
          await tx.project.updateMany({
            where: { id: projectId, companyId, pmId: userId },
            data: { pmId: null },
          });
        }
      }

      for (const projectId of nextIds) {
        if (!existingIds.has(projectId)) {
          await tx.projectAccess.create({
            data: {
              projectId,
              userId,
              role: nextRole,
              canEdit: true,
            },
          });
        } else {
          await tx.projectAccess.update({
            where: { projectId_userId: { projectId, userId } },
            data: { role: nextRole },
          });
        }
        if (nextRole === Role.PROJECT_MANAGER) {
          const previous = await tx.project.findFirst({
            where: { id: projectId, companyId },
            select: { pmId: true },
          });
          if (previous?.pmId && previous.pmId !== userId) {
            await tx.projectAccess.deleteMany({
              where: {
                projectId,
                userId: previous.pmId,
                role: Role.PROJECT_MANAGER,
              },
            });
          }
          await tx.project.updateMany({
            where: { id: projectId, companyId },
            data: { pmId: userId },
          });
        }
      }
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: userId,
    metadata: {
      old: {
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        isActive: membership.user.isActive,
      },
      new: { name, email, role: nextRole, isActive: setActive, projectIds },
    },
  });

  if (membership.role !== nextRole) {
    await writeAudit({
      userId: session.user.id,
      companyId,
      action: "USER_ROLE_CHANGED",
      entityType: "User",
      entityId: userId,
      metadata: { from: membership.role, to: nextRole },
    });
  }

  if (membership.user.isActive !== setActive) {
    await writeAudit({
      userId: session.user.id,
      companyId,
      action: setActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      entityType: "User",
      entityId: userId,
    });
  }

  revalidateUserSurfaces([...new Set([...previousProjectIds, ...projectIds])]);
}

export async function bulkUpdateUsersAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageUsers");
  await rateLimitAction(session.user.id, "bulk-users");

  const userIds = form
    .getAll("userIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  if (userIds.length === 0) throw new AppError("Select at least one user");

  const statusRaw = formString(form, "status");
  const roleRaw = formString(form, "role");
  const companyId = session.membership.companyId;

  if (!statusRaw && !roleRaw) {
    throw new AppError("Choose a status or role to apply");
  }

  let nextRole: Role | null = null;
  if (roleRaw) {
    if (!isValidRole(roleRaw)) throw new AppError("Invalid role");
    nextRole = roleRaw as Role;
    if (!canInviteRole(session.membership.role, nextRole)) {
      throw new ForbiddenError();
    }
  }

  const setActive =
    statusRaw === "INACTIVE"
      ? false
      : statusRaw === "ACTIVE"
        ? true
        : null;

  await prisma.$transaction(async (tx) => {
    for (const userId of userIds) {
      if (userId === session.user.id && setActive === false) {
        throw new AppError("You cannot deactivate your own account");
      }

      const membership = await tx.membership.findFirst({
        where: { userId, companyId },
      });
      if (!membership) continue;

      if (setActive !== null) {
        if (
          !setActive &&
          membership.role === Role.OWNER
        ) {
          const ownerCount = await tx.membership.count({
            where: {
              companyId,
              role: Role.OWNER,
              isActive: true,
              user: { isActive: true },
            },
          });
          if (ownerCount <= 1) {
            throw new AppError("Cannot deactivate the last active owner");
          }
        }
        await tx.user.update({
          where: { id: userId },
          data: { isActive: setActive },
        });
        await tx.membership.updateMany({
          where: { userId, companyId },
          data: { isActive: setActive },
        });
        if (!setActive) {
          await tx.session.deleteMany({ where: { userId } });
        }
      }

      if (nextRole && nextRole !== membership.role) {
        if (membership.role === Role.OWNER && nextRole !== Role.OWNER) {
          const ownerCount = await tx.membership.count({
            where: {
              companyId,
              role: Role.OWNER,
              isActive: true,
              user: { isActive: true },
            },
          });
          if (ownerCount <= 1) {
            throw new AppError("Cannot demote the last active owner");
          }
        }
        await tx.membership.update({
          where: { id: membership.id },
          data: {
            role: nextRole,
            isActive: true,
            ...membershipFlagsForRole(nextRole),
          },
        });
      }
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId,
    action: "USERS_BULK_UPDATED",
    entityType: "User",
    entityId: companyId,
    metadata: { userIds, status: statusRaw || null, role: roleRaw || null },
  });

  revalidateUserSurfaces();
}

export async function exportUsersReportAction(): Promise<string> {
  const session = await requireSession();
  requireCapability(session, "manageUsers");
  await rateLimitAction(session.user.id, "export-users");

  const companyId = session.membership.companyId;
  const memberships = await prisma.membership.findMany({
    where: { companyId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          isActive: true,
          sessions: {
            select: { updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          projectAccess: {
            where: { project: { companyId } },
            select: { project: { select: { name: true } } },
          },
          assignedProjects: {
            where: { companyId },
            select: { name: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const { ROLE_LABELS } = await import("@/lib/permissions");
  const { formatRelativeTime } = await import("@/lib/utils");

  const header = ["Name", "Email", "Role", "Status", "Projects", "Last Activity"];
  const lines = memberships.map((m) => {
    const projectNames = new Set<string>();
    for (const a of m.user.projectAccess) projectNames.add(a.project.name);
    for (const p of m.user.assignedProjects) projectNames.add(p.name);
    const last = m.user.sessions[0]?.updatedAt ?? null;
    const cols = [
      m.user.name,
      m.user.email,
      ROLE_LABELS[m.role],
      m.user.isActive && m.isActive ? "Active" : "Inactive",
      [...projectNames].join("; "),
      formatRelativeTime(last),
    ];
    return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
  });

  await writeAudit({
    userId: session.user.id,
    companyId,
    action: "USERS_EXPORTED",
    entityType: "Company",
    entityId: companyId,
    metadata: { count: memberships.length },
  });

  return [header.join(","), ...lines].join("\n");
}

export async function savePermissionMatrixAction(
  matrix: import("@/lib/permission-matrix").PermissionMatrixState
) {
  const session = await requireSession();
  if (session.membership.role !== Role.OWNER) {
    throw new ForbiddenError();
  }
  await rateLimitAction(session.user.id, "permissions");

  const {
    DEFAULT_PERMISSION_MATRIX,
    MATRIX_ROLES,
    PERMISSION_MODULES,
    parsePermissionMatrix,
  } = await import("@/lib/permission-matrix");
  const { setCompanyPermissionMatrix } = await import(
    "@/lib/permission-matrix-store"
  );

  const cleaned = parsePermissionMatrix(DEFAULT_PERMISSION_MATRIX);
  for (const mod of PERMISSION_MODULES) {
    const row = matrix?.[mod.key];
    if (!row) continue;
    for (const role of MATRIX_ROLES) {
      if (typeof row[role] === "boolean") {
        cleaned[mod.key][role] = row[role];
      }
    }
  }

  await setCompanyPermissionMatrix(session.membership.companyId, cleaned);

  // Keep membership.financeAccess in sync with Financial Report matrix toggles
  // so invoice/budget UI matches what the Owner configured.
  const { FINANCE_MATRIX_ROLES } = await import("@/lib/permissions");
  for (const role of FINANCE_MATRIX_ROLES) {
    if (!(MATRIX_ROLES as readonly Role[]).includes(role)) continue;
    const grant = Boolean(
      cleaned.financialReport[role as (typeof MATRIX_ROLES)[number]]
    );
    await prisma.membership.updateMany({
      where: {
        companyId: session.membership.companyId,
        role,
      },
      data: { financeAccess: grant },
    });
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "PERMISSION_MATRIX_UPDATED",
    entityType: "Company",
    entityId: session.membership.companyId,
  });

  revalidatePath("/owner/permissions");
  revalidatePath("/owner");
  revalidatePath("/pm");
  revalidatePath("/bookkeeper");
  revalidatePath("/bookkeeper/invoices");
  revalidatePath("/settings");
}

export async function configureProjectAction(form: FormData) {
  const session = await requireSession();
  await rateLimitAction(session.user.id, "project-configure");

  const role = session.membership.role;
  const canConfigure =
    role === Role.OWNER ||
    role === Role.CEO ||
    role === Role.OPERATIONS_ADMIN;
  if (!canConfigure) throw new ForbiddenError();

  const parsed = configureProjectFormSchema.safeParse(formDataToObject(form));
  if (!parsed.success) {
    throw new AppError(
      parsed.error.issues[0]?.message || "Invalid project configuration"
    );
  }

  const data = parsed.data;
  await assertProjectAccess(session, data.projectId);

  const existing = await prisma.project.findFirst({
    where: {
      id: data.projectId,
      companyId: session.membership.companyId,
    },
  });
  if (!existing) throw new AppError("Project not found");

  const pmId = data.pmId || null;
  if (pmId) await assertCompanyUser(session, pmId);

  const targetClosing =
    data.targetClosing && data.targetClosing.length > 0
      ? new Date(data.targetClosing)
      : null;
  if (targetClosing && Number.isNaN(targetClosing.getTime())) {
    throw new AppError("Deadline is invalid");
  }

  const changes: Record<string, unknown> = {};
  if (data.name !== existing.name) changes.name = { from: existing.name, to: data.name };
  if (pmId !== existing.pmId) changes.pmId = { from: existing.pmId, to: pmId };
  if (data.status !== existing.status) {
    changes.status = { from: existing.status, to: data.status };
  }
  const nextClosing = targetClosing;
  const prevClosing = existing.targetClosing?.toISOString() ?? null;
  const nextClosingIso = nextClosing?.toISOString() ?? null;
  if (nextClosingIso !== prevClosing) {
    changes.targetClosing = { from: prevClosing, to: nextClosingIso };
  }
  if (
    data.purchasePrice !== undefined &&
    data.purchasePrice !== existing.purchasePrice
  ) {
    changes.purchasePrice = {
      from: existing.purchasePrice,
      to: data.purchasePrice,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: data.projectId },
      data: {
        name: data.name,
        pmId,
        status: data.status,
        targetClosing: nextClosing,
        ...(data.purchasePrice !== undefined
          ? { purchasePrice: data.purchasePrice }
          : {}),
      },
    });

    // When the assigned PM changes, revoke the previous PM's project access so
    // they no longer see this job on Overview / Jobs / pickers.
    if (existing.pmId && existing.pmId !== pmId) {
      await tx.projectAccess.deleteMany({
        where: {
          projectId: data.projectId,
          userId: existing.pmId,
          role: Role.PROJECT_MANAGER,
        },
      });
    }

    if (pmId && pmId !== existing.pmId) {
      await tx.projectAccess.upsert({
        where: {
          projectId_userId: { projectId: data.projectId, userId: pmId },
        },
        create: {
          projectId: data.projectId,
          userId: pmId,
          role: Role.PROJECT_MANAGER,
          canEdit: true,
        },
        update: { canEdit: true, role: Role.PROJECT_MANAGER },
      });
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: data.projectId,
    action: "PROJECT_CONFIGURED",
    entityType: "Project",
    entityId: data.projectId,
    metadata: changes,
  });

  if (pmId && pmId !== existing.pmId) {
    const buyerName = existing.buyerId
      ? await prisma.buyer.findUnique({
          where: { id: existing.buyerId },
          select: { firstName: true, lastName: true },
        })
      : null;
    const clientLabel = buyerName
      ? `${buyerName.firstName} ${buyerName.lastName}`.trim()
      : null;
    try {
      await createNotificationOnce({
        userId: pmId,
        companyId: session.membership.companyId,
        type: "PROJECT_ASSIGNED",
        title: `You have been assigned to ${existing.name}`,
        body: [
          clientLabel ? `Client: ${clientLabel}` : null,
          `Assigned ${new Date().toLocaleDateString()}`,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/pm/projects/${data.projectId}`,
        entityType: "Project",
        entityId: data.projectId,
      });
    } catch (err) {
      console.error("[project] assignment notification/SMS skipped", err);
    }
  }

  revalidateJobsSurfaces(data.projectId);
  revalidatePath("/notifications");
  revalidatePath("/pm");
  await syncProjectProgress(data.projectId);
  revalidateProjectProgressSurfaces(data.projectId);
  revalidateNotificationInbox();
}

const PROFILE_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function updateOwnProfileAction(form: FormData) {
  const session = await requireSession();
  await rateLimitAction(session.user.id, "profile-update", true);

  const name = formString(form, "name");
  if (!name || name.length < 2) {
    throw new AppError("Name must be at least 2 characters");
  }
  if (name.length > 120) {
    throw new AppError("Name is too long");
  }

  const file = form.get("image");
  let nextImage: string | undefined;
  let nextPublicId: string | null | undefined;

  if (file instanceof File && file.size > 0) {
    let uploaded;
    try {
      uploaded = await saveUpload(file, `avatars/${session.user.id}`, {
        maxUploadBytes: PROFILE_IMAGE_MAX_BYTES,
        allowedExtensions: PROFILE_IMAGE_EXTENSIONS,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error("[profile-upload] storage failed", err);
      throw new AppError(
        "Failed to upload profile image. Check CLOUDINARY_URL on the server.",
        502,
        "STORAGE_UPLOAD_FAILED"
      );
    }
    nextImage = uploaded.filePath;
    nextPublicId = uploaded.publicId;

    const previous = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true, imagePublicId: true },
    });

    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          name,
          image: nextImage,
          imagePublicId: nextPublicId,
        },
      });
    } catch (err) {
      await deleteUpload(uploaded.filePath, {
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
      });
      throw err;
    }

    if (previous?.image || previous?.imagePublicId) {
      await deleteUpload(previous.image, {
        publicId: previous.imagePublicId,
        resourceType: "image",
      });
    }
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
    });
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "PROFILE_UPDATED",
    entityType: "User",
    entityId: session.user.id,
    metadata: { name, imageUpdated: Boolean(nextImage) },
  });

  revalidatePath("/profile", "layout");
  revalidatePath("/owner/users");
}

