/**
 * Live credential check (does not print the API secret).
 *
 * Usage (from repo root):
 *   npx tsx scripts/verify-cloudinary.ts
 *
 * Loads .env.local when present. Exit 0 on success, 1 on failure.
 */

import { config as loadEnv } from "dotenv";
import {
  getCloudinary,
  getCloudinaryPublicInfo,
  pingCloudinary,
  readCloudinaryCredentials,
} from "../src/lib/cloudinary";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const info = getCloudinaryPublicInfo();
  console.log("[verify-cloudinary] env", info);

  const creds = readCloudinaryCredentials();
  if (!creds) {
    console.error(
      "[verify-cloudinary] FAIL — set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET)"
    );
    process.exit(1);
  }

  // Force SDK configure so logs show which account is used.
  getCloudinary();

  const ok = await pingCloudinary(10000);
  if (!ok) {
    console.error(
      "[verify-cloudinary] FAIL — Cloudinary rejected credentials (api_secret mismatch or invalid key).",
      "Regenerate API Key + Secret in Cloudinary Dashboard → Settings → API Keys,",
      "update CLOUDINARY_URL in .env.local and Render, remove leftover CLOUDINARY_API_* vars, restart."
    );
    process.exit(1);
  }

  console.log("[verify-cloudinary] OK — uploads should work with these credentials.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[verify-cloudinary] FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
