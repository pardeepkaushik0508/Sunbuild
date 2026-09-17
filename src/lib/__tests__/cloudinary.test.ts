/**
 * Unit tests for Cloudinary URL parsing / config helpers.
 * Run: npx tsx --test src/lib/__tests__/cloudinary.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCloudinaryUrl,
  parseCloudinaryUrl,
  isCloudinaryConfigured,
  readCloudinaryCredentials,
  toCloudinaryFolder,
  maskApiKey,
} from "../cloudinary";

function withCloudinaryEnv(
  next: {
    url?: string | null;
    name?: string | null;
    key?: string | null;
    secret?: string | null;
  },
  fn: () => void
) {
  const prev = {
    url: process.env.CLOUDINARY_URL,
    name: process.env.CLOUDINARY_CLOUD_NAME,
    key: process.env.CLOUDINARY_API_KEY,
    secret: process.env.CLOUDINARY_API_SECRET,
  };
  const set = (envKey: string, value: string | null | undefined) => {
    if (value === null) delete process.env[envKey];
    else if (value !== undefined) process.env[envKey] = value;
  };
  const restore = (envKey: string, previous: string | undefined) => {
    if (previous === undefined) delete process.env[envKey];
    else process.env[envKey] = previous;
  };
  try {
    set("CLOUDINARY_URL", next.url);
    set("CLOUDINARY_CLOUD_NAME", next.name);
    set("CLOUDINARY_API_KEY", next.key);
    set("CLOUDINARY_API_SECRET", next.secret);
    fn();
  } finally {
    restore("CLOUDINARY_URL", prev.url);
    restore("CLOUDINARY_CLOUD_NAME", prev.name);
    restore("CLOUDINARY_API_KEY", prev.key);
    restore("CLOUDINARY_API_SECRET", prev.secret);
  }
}

describe("cloudinary url helpers", () => {
  it("strips angle-bracket wrappers from credentials", () => {
    const raw =
      "cloudinary://<12345>:<secret_value>@demo-cloud";
    assert.equal(
      normalizeCloudinaryUrl(raw),
      "cloudinary://12345:secret_value@demo-cloud"
    );
  });

  it("strips wrapping quotes from CLOUDINARY_URL", () => {
    assert.equal(
      normalizeCloudinaryUrl('"cloudinary://12345:secret_value@demo-cloud"'),
      "cloudinary://12345:secret_value@demo-cloud"
    );
  });

  it("strips accidental CLOUDINARY_URL= paste prefix", () => {
    assert.equal(
      normalizeCloudinaryUrl(
        "CLOUDINARY_URL=cloudinary://12345:secret_value@demo-cloud"
      ),
      "cloudinary://12345:secret_value@demo-cloud"
    );
    assert.equal(
      normalizeCloudinaryUrl(
        "CLOUDINARY_URL=CLOUDINARY_URL=cloudinary://12345:secret_value@demo-cloud"
      ),
      "cloudinary://12345:secret_value@demo-cloud"
    );
  });

  it("parses cloudinary:// URL into SDK fields", () => {
    const parsed = parseCloudinaryUrl(
      "cloudinary://232197833779359:abc~secret@dqwozzjb7"
    );
    assert.equal(parsed.cloud_name, "dqwozzjb7");
    assert.equal(parsed.api_key, "232197833779359");
    assert.equal(parsed.api_secret, "abc~secret");
  });

  it("parses secrets that contain hyphens and underscores", () => {
    const parsed = parseCloudinaryUrl(
      "cloudinary://key123:xTqB4Da0ir-F_8eV0dSPAIUN-eQ@demo-cloud"
    );
    assert.equal(parsed.api_secret, "xTqB4Da0ir-F_8eV0dSPAIUN-eQ");
  });

  it("maps selection folders under projects/", () => {
    assert.equal(
      toCloudinaryFolder("selections/proj123"),
      "sunbuild/projects/proj123/selections"
    );
  });

  it("maps avatar folders under users/", () => {
    assert.equal(
      toCloudinaryFolder("avatars/user1"),
      "sunbuild/users/user1/avatars"
    );
  });

  it("masks api keys without exposing the full value", () => {
    assert.equal(maskApiKey("232197833779359"), "…9359");
  });

  it("reports configured from discrete dashboard env vars", () => {
    withCloudinaryEnv(
      {
        url: null,
        name: "demo-cloud",
        key: "key123",
        secret: "secret456",
      },
      () => {
        assert.equal(isCloudinaryConfigured(), true);
        const creds = readCloudinaryCredentials();
        assert.equal(creds?.source, "discrete");
        assert.equal(creds?.cloud_name, "demo-cloud");
      }
    );
  });

  it("reports configured when CLOUDINARY_URL is valid", () => {
    withCloudinaryEnv(
      {
        url: "cloudinary://key123:secret456@my-cloud",
        name: null,
        key: null,
        secret: null,
      },
      () => {
        assert.equal(isCloudinaryConfigured(), true);
        const creds = readCloudinaryCredentials();
        assert.equal(creds?.source, "url");
        assert.equal(creds?.cloud_name, "my-cloud");
      }
    );
  });

  it("prefers CLOUDINARY_URL when discrete vars disagree", () => {
    withCloudinaryEnv(
      {
        url: "cloudinary://urlKey:urlSecret@url-cloud",
        name: "other-cloud",
        key: "otherKey",
        secret: "otherSecret",
      },
      () => {
        const creds = readCloudinaryCredentials();
        assert.equal(creds?.source, "url");
        assert.equal(creds?.cloud_name, "url-cloud");
        assert.equal(creds?.api_key, "urlKey");
        assert.equal(creds?.api_secret, "urlSecret");
      }
    );
  });

  it("reports not configured when CLOUDINARY_URL missing", () => {
    withCloudinaryEnv(
      { url: null, name: null, key: null, secret: null },
      () => {
        assert.equal(isCloudinaryConfigured(), false);
        assert.equal(readCloudinaryCredentials(), null);
      }
    );
  });
});
