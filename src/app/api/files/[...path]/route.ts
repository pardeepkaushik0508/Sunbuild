import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/session";
import { readUpload } from "@/lib/storage";
import { assertFileDownloadAccess } from "@/lib/file-access";
import { AppError, toSafeErrorMessage } from "@/lib/errors";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const session = await requireApiSession();
    assertRateLimit(
      clientKeyFromHeaders(request.headers, `file:${session.user.id}`),
      ACTION_RATE.limit,
      ACTION_RATE.windowMs
    );

    const { path: segments } = await params;
    const filePath = segments.map(decodeURIComponent).join("/");

    if (!filePath || filePath.includes("..") || path.isAbsolute(filePath)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    await assertFileDownloadAccess(session, filePath);

    const buffer = await readUpload(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    // Do not trust stored basename for Content-Disposition injection
    const safeName = path
      .basename(filePath)
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 120);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const message =
      status === 401
        ? "Authentication required"
        : status === 403
          ? "Forbidden"
          : status === 404
            ? "File not found"
            : toSafeErrorMessage(error);
    return NextResponse.json(
      { error: message },
      {
        status: status === 500 ? 404 : status,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}
