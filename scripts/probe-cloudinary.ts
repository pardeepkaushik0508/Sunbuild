import { readFileSync } from "fs";
import { resolve } from "path";

for (const file of [".env.local", ".env"]) {
  try {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // optional
  }
}

async function main() {
  const { getCloudinary, toCloudinaryFolder } = await import(
    "../src/lib/cloudinary.ts"
  );

  const api = getCloudinary();
  const tiny = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const folder = toCloudinaryFolder("selections/probe");
  console.log("folder:", folder);
  console.log("config cloud_name:", api.config().cloud_name);
  console.log("config api_key set:", Boolean(api.config().api_key));

  await new Promise<void>((resolvePromise, reject) => {
    const stream = api.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
      },
      (error, res) => {
        if (error || !res) {
          console.error(
            "raw error keys:",
            error && Object.keys(error as object)
          );
          console.error("raw error:", JSON.stringify(error, null, 2));
          reject(error ?? new Error("empty"));
          return;
        }
        console.log("ok", res.public_id, res.secure_url);
        resolvePromise();
      }
    );
    stream.end(tiny);
  });
}

main().catch(() => {
  process.exitCode = 1;
});
