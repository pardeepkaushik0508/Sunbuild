"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f9fafb",
          color: "#111827",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#ef4444" }}>
            Error
          </p>
          <h1 style={{ fontSize: 24, margin: "8px 0" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 420 }}>
            A critical application error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              height: 40,
              padding: "0 20px",
              borderRadius: 10,
              border: "none",
              background: "#1f2937",
              color: "#fff",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
