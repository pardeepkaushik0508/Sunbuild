import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP tuned for Next.js App Router + same-origin API.
 * 'unsafe-inline' for styles is required by Next/Tailwind runtime in many setups.
 * React/Next need 'unsafe-eval' in development for debugging call stacks;
 * production CSP keeps scripts stricter (no unsafe-eval).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.cloudinary.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
  "media-src 'self' https://res.cloudinary.com https://*.cloudinary.com",
  "worker-src 'self' blob:",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["twilio"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
    // Default Server Action body limit is 1MB; uploads allow up to 20MB
    // (see DEFAULT_FILE_STORAGE). Leave headroom for multipart overhead.
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // Render Free reports many CPUs; default worker count can OOM.
    // Cap hard for constrained build environments (TypeScript + static gen).
    cpus: 1,
    workerThreads: false,
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 50,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
