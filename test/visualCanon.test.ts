import assert from "node:assert/strict";
import test from "node:test";
import {
  findVisualCanonEntriesForAsset,
  parseVisualCanon,
  resolveVisualCanonEntry,
  VisualCanonError,
} from "../src/core/visualCanon";

const validCanon = JSON.stringify({
  schemaVersion: 1,
  entries: [
    {
      id: "goblin",
      kind: "character",
      anchors: ["assets/enemies/goblin_idle.png", "assets/enemies/goblin_portrait.png"],
      constraints: ["hand-painted dark fantasy", "moss-green palette"],
      forbidden: ["photorealistic"],
    },
    {
      id: "forest-night",
      kind: "environment",
      anchors: ["assets/environments/forest.png"],
    },
  ],
});

test("parses character and non-character Visual Canon entries", () => {
  const canon = parseVisualCanon(validCanon);
  assert.equal(canon.entries[0].kind, "character");
  assert.equal(canon.entries[1].kind, "environment");
  assert.deepEqual(findVisualCanonEntriesForAsset(canon, "./assets/enemies/goblin_idle.png").map((entry) => entry.id), ["goblin"]);
});

test("resolves anchors and constraints into Generation Package context", () => {
  const resolved = resolveVisualCanonEntry(parseVisualCanon(validCanon), "goblin", [
    "assets/enemies/goblin_idle.png",
    "assets/enemies/goblin_portrait.png",
  ]);
  assert.equal(resolved.entry.kind, "character");
  assert.deepEqual(resolved.references, [
    { relativePath: "assets/enemies/goblin_idle.png", role: "style", required: true },
    { relativePath: "assets/enemies/goblin_portrait.png", role: "style", required: true },
  ]);
  assert.deepEqual(resolved.context, {
    subjectId: "goblin",
    constraints: ["hand-painted dark fantasy", "moss-green palette"],
    forbidden: ["photorealistic"],
  });
});

test("fails closed when a required Canon anchor is missing", () => {
  assert.throws(
    () => resolveVisualCanonEntry(parseVisualCanon(validCanon), "goblin", ["assets/enemies/goblin_idle.png"]),
    (error: unknown) => error instanceof VisualCanonError && error.message.includes("goblin_portrait.png"),
  );
});

test("rejects unsafe Canon anchor paths", () => {
  const invalid = JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: "escape", kind: "item", anchors: ["../outside.png"] }],
  });
  assert.throws(() => parseVisualCanon(invalid), VisualCanonError);
});
