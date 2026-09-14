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

  it("parses cloudinary:// URL into SDK fields", () => {
    const parsed = parseCloudinaryUrl(
      "cloudinary://232197833779359:abc~secret@dqwozzjb7"
    );
    assert.equal(parsed.cloud_name, "dqwozzjb7");
    assert.equal(parsed.api_key, "232197833779359");
    assert.equal(parsed.api_secret, "abc~secret");
  });

  it("maps photo folders under projects/", () => {
    assert.equal(
      toCloudinaryFolder("photos/proj123"),
      "sunbuild/projects/proj123/photos"
    );
  });

  it("maps avatar folders under users/", () => {
    assert.equal(
      toCloudinaryFolder("avatars/user1"),
      "sunbuild/users/user1/avatars"
    );
  });

  it("reports configured when CLOUDINARY_URL is valid", () => {
    const prev = process.env.CLOUDINARY_URL;
    process.env.CLOUDINARY_URL =
      "cloudinary://key123:secret456@my-cloud";
    try {
      assert.equal(isCloudinaryConfigured(), true);
    } finally {
      if (prev === undefined) delete process.env.CLOUDINARY_URL;
      else process.env.CLOUDINARY_URL = prev;
    }
  });

  it("reports not configured when CLOUDINARY_URL missing", () => {
    const prev = process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_URL;
    try {
      assert.equal(isCloudinaryConfigured(), false);
    } finally {
      if (prev !== undefined) process.env.CLOUDINARY_URL = prev;
    }
  });
});
