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
  const [generated, setGenerated] = useState<{
    forUri: string;
    forSize: number;
    dataUrl: string | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await QRCode.toDataURL(uri, {
          width: size,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#111827", light: "#ffffff" },
        });
        if (!cancelled) {
          setGenerated({ forUri: uri, forSize: size, dataUrl: url, failed: false });
        }
      } catch {
        if (!cancelled) {
          setGenerated({ forUri: uri, forSize: size, dataUrl: null, failed: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, size]);

  const matching =
    generated?.forUri === uri && generated?.forSize === size;
  const dataUrl = matching ? generated.dataUrl : null;
  const failed = matching ? generated.failed : false;

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
