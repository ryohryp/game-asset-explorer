import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAssetUsageHealth,
  extractDirectImageReferences,
  findMissingDirectReferences,
  normalizeWorkspaceImageReference,
} from "../src/core/assetHealth";

test("classifies observed usages as referenced", () => {
  assert.deepEqual(classifyAssetUsageHealth(3), {
    status: "referenced",
    usageCount: 3,
    evidence: "direct",
  });
});

test("classifies zero usages as unused candidate", () => {
  assert.deepEqual(classifyAssetUsageHealth(0), {
    status: "unused-candidate",
    usageCount: 0,
    evidence: "candidate",
  });
});

test("extracts direct workspace image references and normalizes path variants", () => {
  const text = [
    "const a = 'assets/ui/icon.png';",
    "const b = \"./assets/bg/title.webp\";",
    "const c = `/assets/enemies/slime.gif`;",
  ].join("\n");

  assert.deepEqual(
    extractDirectImageReferences(text).map((reference) => reference.normalizedPath),
    ["assets/ui/icon.png", "assets/bg/title.webp", "assets/enemies/slime.gif"],
  );
});

test("ignores dynamic, external, parent-relative, filename-only, and non-image strings", () => {
  const text = [
    "const dynamic = `assets/${name}.png`;",
    "const external = 'https://example.com/icon.png';",
    "const parent = '../assets/icon.png';",
    "const filenameOnly = 'icon.png';",
    "const source = 'assets/ui/icon.ts';",
  ].join("\n");

  assert.deepEqual(extractDirectImageReferences(text), []);
});

test("normalizes direct workspace paths conservatively", () => {
  assert.equal(normalizeWorkspaceImageReference("./assets/ui/icon.png"), "assets/ui/icon.png");
  assert.equal(normalizeWorkspaceImageReference("/assets/ui/icon.png"), "assets/ui/icon.png");
  assert.equal(normalizeWorkspaceImageReference("assets\\ui\\icon.png"), "assets/ui/icon.png");
  assert.equal(normalizeWorkspaceImageReference("../assets/ui/icon.png"), undefined);
  assert.equal(normalizeWorkspaceImageReference("icon.png"), undefined);
});

test("reports only unresolved direct references", () => {
  const references = extractDirectImageReferences([
    "const existing = 'assets/ui/icon.png';",
    "const missing = 'assets/ui/missing.png';",
  ].join("\n"));

  const missing = findMissingDirectReferences(references, ["assets/ui/icon.png"]);
  assert.deepEqual(missing.map((reference) => reference.normalizedPath), ["assets/ui/missing.png"]);
});

test("path comparison remains workspace-local data without cross-root identity", () => {
  const reference = extractDirectImageReferences("const icon = 'assets/ui/icon.png';");

  assert.equal(findMissingDirectReferences(reference, ["assets/ui/icon.png"]).length, 0);
  assert.equal(findMissingDirectReferences(reference, ["other/assets/ui/icon.png"]).length, 1);
});
