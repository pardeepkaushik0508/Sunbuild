/** Shared cookie name — safe for client and server imports. */
export const FLASH_TOAST_COOKIE = "sb_flash_toast";

export type FlashToastPayload = {
  type: "success" | "error" | "info";
  message: string;
};
