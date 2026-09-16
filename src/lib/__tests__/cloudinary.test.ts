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
  toCloudinaryFolder,
} from "../cloudinary";

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

  it("parses cloudinary:// URL into SDK fields", () => {
    const parsed = parseCloudinaryUrl(
      "cloudinary://232197833779359:abc~secret@dqwozzjb7"
    );
    assert.equal(parsed.cloud_name, "dqwozzjb7");
    assert.equal(parsed.api_key, "232197833779359");
    assert.equal(parsed.api_secret, "abc~secret");
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

  it("reports configured from discrete dashboard env vars", () => {
    const prev = {
      url: process.env.CLOUDINARY_URL,
      name: process.env.CLOUDINARY_CLOUD_NAME,
      key: process.env.CLOUDINARY_API_KEY,
      secret: process.env.CLOUDINARY_API_SECRET,
    };
    delete process.env.CLOUDINARY_URL;
    process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
    process.env.CLOUDINARY_API_KEY = "key123";
    process.env.CLOUDINARY_API_SECRET = "secret456";
    try {
      assert.equal(isCloudinaryConfigured(), true);
    } finally {
      if (prev.url === undefined) delete process.env.CLOUDINARY_URL;
      else process.env.CLOUDINARY_URL = prev.url;
      if (prev.name === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
      else process.env.CLOUDINARY_CLOUD_NAME = prev.name;
      if (prev.key === undefined) delete process.env.CLOUDINARY_API_KEY;
      else process.env.CLOUDINARY_API_KEY = prev.key;
      if (prev.secret === undefined) delete process.env.CLOUDINARY_API_SECRET;
      else process.env.CLOUDINARY_API_SECRET = prev.secret;
    }
  });

  it("reports configured when CLOUDINARY_URL is valid", () => {
    const prev = {
      url: process.env.CLOUDINARY_URL,
      name: process.env.CLOUDINARY_CLOUD_NAME,
      key: process.env.CLOUDINARY_API_KEY,
      secret: process.env.CLOUDINARY_API_SECRET,
    };
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    process.env.CLOUDINARY_URL =
      "cloudinary://key123:secret456@my-cloud";
    try {
      assert.equal(isCloudinaryConfigured(), true);
    } finally {
      if (prev.url === undefined) delete process.env.CLOUDINARY_URL;
      else process.env.CLOUDINARY_URL = prev.url;
      if (prev.name === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
      else process.env.CLOUDINARY_CLOUD_NAME = prev.name;
      if (prev.key === undefined) delete process.env.CLOUDINARY_API_KEY;
      else process.env.CLOUDINARY_API_KEY = prev.key;
      if (prev.secret === undefined) delete process.env.CLOUDINARY_API_SECRET;
      else process.env.CLOUDINARY_API_SECRET = prev.secret;
    }
  });

  it("reports not configured when CLOUDINARY_URL missing", () => {
    const prev = {
      url: process.env.CLOUDINARY_URL,
      name: process.env.CLOUDINARY_CLOUD_NAME,
      key: process.env.CLOUDINARY_API_KEY,
      secret: process.env.CLOUDINARY_API_SECRET,
    };
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    try {
      assert.equal(isCloudinaryConfigured(), false);
    } finally {
      if (prev.url === undefined) delete process.env.CLOUDINARY_URL;
      else process.env.CLOUDINARY_URL = prev.url;
      if (prev.name === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
      else process.env.CLOUDINARY_CLOUD_NAME = prev.name;
      if (prev.key === undefined) delete process.env.CLOUDINARY_API_KEY;
      else process.env.CLOUDINARY_API_KEY = prev.key;
      if (prev.secret === undefined) delete process.env.CLOUDINARY_API_SECRET;
      else process.env.CLOUDINARY_API_SECRET = prev.secret;
    }
  });
});
