"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLASH_TOAST_COOKIE } from "@/lib/flash-toast-shared";

export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  type: ToastTone;
  message: string;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_HIDE_MS = 4000;

function readFlashCookie(): ToastItem | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${FLASH_TOAST_COOKIE}=`));
  if (!match) return null;
  const raw = match.slice(FLASH_TOAST_COOKIE.length + 1);
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as {
      type?: ToastTone;
      message?: string;
    };
    if (!parsed?.message) return null;
    return {
      id: `flash-${Date.now()}`,
      type: parsed.type ?? "success",
      message: parsed.message,
    };
  } catch {
    return null;
  } finally {
    document.cookie = `${FLASH_TOAST_COOKIE}=; Max-Age=0; path=/`;
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, type: ToastTone = "success") => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-4), { id, type, message: trimmed }]);
      const timer = setTimeout(() => dismiss(id), AUTO_HIDE_MS);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const flash = readFlashCookie();
    if (flash) {
      setItems((prev) => [...prev, flash]);
      const timer = setTimeout(() => dismiss(flash.id), AUTO_HIDE_MS);
      timers.current.set(flash.id, timer);
    }
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
      info: (message) => push(message, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed z-[100] flex w-[min(100vw-40px,380px)] flex-col gap-2"
        style={{ top: 20, right: 20 }}
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm shadow-lg",
              item.type === "success" &&
                "border-emerald-200 bg-white text-emerald-800",
              item.type === "error" && "border-red-200 bg-white text-[#dc2626]",
              item.type === "info" && "border-sb-border bg-white text-sb-ink"
            )}
          >
            <p className="min-w-0 flex-1 font-medium leading-snug">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded-md p-0.5 text-sb-muted hover:bg-sb-canvas hover:text-sb-ink"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

/** Safe toast hook — no-ops when provider is missing (e.g. isolated tests). */
export function useOptionalToast() {
  return useContext(ToastContext);
}
