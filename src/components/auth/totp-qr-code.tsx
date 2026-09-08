"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a scannable QR for an otpauth:// TOTP URI.
 */
export function TotpQrCode({
  uri,
  size = 200,
  className,
}: {
  uri: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDataUrl(null);
    QRCode.toDataURL(uri, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri, size]);

  if (failed) {
    return (
      <p className="text-center text-xs text-sb-muted">
        QR could not be generated. Use the URI below manually.
      </p>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className="mx-auto animate-pulse rounded-[12px] bg-sb-canvas"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Scan this QR code with your authenticator app"
      className={className ?? "mx-auto rounded-[12px] border border-sb-border bg-white p-2"}
    />
  );
}
