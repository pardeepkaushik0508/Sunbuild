import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  FLASH_TOAST_COOKIE,
  type FlashToastPayload,
} from "@/lib/flash-toast-shared";

export { FLASH_TOAST_COOKIE, type FlashToastPayload };

/** Set a one-shot toast cookie (readable by the client ToastProvider). */
export async function setFlashToast(toast: FlashToastPayload) {
  const jar = await cookies();
  jar.set(FLASH_TOAST_COOKIE, encodeURIComponent(JSON.stringify(toast)), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60,
  });
}

/** Flash a success/error toast, then redirect (for server actions). */
export async function redirectWithToast(
  url: string,
  message: string,
  type: FlashToastPayload["type"] = "success"
): Promise<never> {
  await setFlashToast({ type, message });
  redirect(url);
}
