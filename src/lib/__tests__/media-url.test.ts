/**
 * Run: npx tsx --test src/lib/__tests__/media-url.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mediaThumbnailUrl, mediaUrl } from "../utils";
import { bundledLegacyMediaPath } from "../storage";

describe("mediaUrl", () => {
  it("upgrades Cloudinary http URLs to https", () => {
    assert.equal(
      mediaUrl("http://res.cloudinary.com/demo/image/upload/v1/sample.jpg"),
      "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"
    );
  });

  it("upgrades protocol-relative Cloudinary URLs", () => {
    assert.equal(
      mediaUrl("//res.cloudinary.com/demo/image/upload/v1/sample.jpg"),
      "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg"
    );
  });

  it("maps seed placeholders to public files", () => {
    assert.equal(mediaUrl("seed/placeholder.txt"), "/placeholders/site-progress.svg");
  });

  it("routes relative uploads through the authenticated file API", () => {
    assert.equal(
      mediaUrl("heroes/abc/banner.webp"),
      "/api/files/heroes/abc/banner.webp"
    );
  });
});

describe("mediaThumbnailUrl", () => {
  it("inserts Cloudinary transforms for any cloudinary.com host", () => {
    assert.equal(
      mediaThumbnailUrl(
        "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
        { width: 100, height: 80 }
      ),
      "https://res.cloudinary.com/demo/image/upload/c_fill,f_auto,q_auto,w_100,h_80/v1/sample.jpg"
    );
  });

  it("uses c_fit when crop is fit (contain galleries)", () => {
    assert.equal(
      mediaThumbnailUrl(
        "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
        { width: 800, height: 800, crop: "fit" }
      ),
      "https://res.cloudinary.com/demo/image/upload/c_fit,f_auto,q_auto,w_800,h_800/v1/sample.jpg"
    );
  });
});

describe("bundledLegacyMediaPath", () => {
  it("keeps the relative path under public/legacy-media", () => {
    const abs = bundledLegacyMediaPath("heroes/id/file.webp");
    assert.match(abs.replace(/\\/g, "/"), /public\/legacy-media\/heroes\/id\/file\.webp$/);
  });
});
