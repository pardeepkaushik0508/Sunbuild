import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  requireApiSession,
  assertProjectAccess,
} from "@/lib/session";
import { requireClientHeroAccess } from "@/lib/authorization";
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  toSafeErrorMessage,
} from "@/lib/errors";
import {
  ACTION_RATE,
  UPLOAD_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";
import {
  getHeroImageFiles,
  saveProjectHeroImages,
  clearProjectHeroImage,
  removeProjectHeroImage,
} from "@/lib/projects/hero-image";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function authorize(projectId: string, request: NextRequest) {
  const session = await requireApiSession();
  requireClientHeroAccess(session);
  await assertProjectAccess(session, projectId);
  return session;
}

/** POST multipart — add one or more banner images. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const session = await authorize(projectId, request);
    assertRateLimit(
      clientKeyFromHeaders(request.headers, `hero-upload:${session.user.id}`),
      UPLOAD_RATE.limit,
      UPLOAD_RATE.windowMs
    );

    const form = await request.formData();
    const files = getHeroImageFiles(form);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one house mockup image to upload." },
        { status: 400 }
      );
    }

    const result = await saveProjectHeroImages({
      session,
      projectId,
      files,
    });
    revalidatePath(`/pm/projects/${projectId}`);
    revalidatePath("/client");
    return NextResponse.json({
      success: true,
      urls: result.urls,
      added: result.added.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err instanceof AppError) {
      return NextResponse.json(
        { error: toSafeErrorMessage(err) },
        { status: err instanceof AppError ? err.status : 403 }
      );
    }
    console.error("[api/projects/hero POST]", err);
    return NextResponse.json(
      { error: "Failed to upload banner images. Please try again." },
      { status: 500 }
    );
  }
}

/** DELETE — clear all, or one image via ?imageUrl= */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const session = await authorize(projectId, request);
    assertRateLimit(
      clientKeyFromHeaders(request.headers, `hero-remove:${session.user.id}`),
      ACTION_RATE.limit,
      ACTION_RATE.windowMs
    );

    const imageUrl = request.nextUrl.searchParams.get("imageUrl");
    if (imageUrl) {
      await removeProjectHeroImage({ session, projectId, imageUrl });
    } else {
      await clearProjectHeroImage({ session, projectId });
    }
    revalidatePath(`/pm/projects/${projectId}`);
    revalidatePath("/client");
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err instanceof AppError) {
      return NextResponse.json(
        { error: toSafeErrorMessage(err) },
        { status: err instanceof AppError ? err.status : 403 }
      );
    }
    console.error("[api/projects/hero DELETE]", err);
    return NextResponse.json(
      { error: "Failed to remove banner image. Please try again." },
      { status: 500 }
    );
  }
}
