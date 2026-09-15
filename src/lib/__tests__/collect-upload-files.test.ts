import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectUploadFiles,
  parseClientVisibleFlag,
} from "../media/collect-upload-files";

describe("collectUploadFiles", () => {
  it("collects unique files from file, photos, and images fields", () => {
    const form = new FormData();
    const a = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const b = new File(["bb"], "b.jpg", { type: "image/jpeg" });
    form.append("file", a);
    form.append("photos", b);
    form.append("images", a);
    const files = collectUploadFiles(form);
    assert.equal(files.length, 2);
    assert.equal(files[0].name, "a.jpg");
    assert.equal(files[1].name, "b.jpg");
  });

  it("ignores empty files", () => {
    const form = new FormData();
    form.append("file", new File([], "empty.jpg", { type: "image/jpeg" }));
    assert.equal(collectUploadFiles(form).length, 0);
  });
});

describe("parseClientVisibleFlag", () => {
  it("defaults to true when empty", () => {
    assert.equal(parseClientVisibleFlag(""), true);
    assert.equal(parseClientVisibleFlag(null, true), true);
  });

  it("parses false values", () => {
    assert.equal(parseClientVisibleFlag("false"), false);
    assert.equal(parseClientVisibleFlag("0"), false);
    assert.equal(parseClientVisibleFlag("off"), false);
  });
});
