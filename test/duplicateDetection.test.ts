import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findExactDuplicateAssets } from "../src/core/duplicateDetection";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(path: string, relativePath: string): WorkspaceAsset {
  return { workspaceFolderUri: "file:///workspace", workspaceFolderName: "workspace", asset: { absolutePath: path, relativePath, fileName: relativePath, fileType: "png" } };
}

test("groups files with identical bytes and reports size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gae-duplicates-"));
  const first = join(dir, "a.png");
  const second = join(dir, "b.png");
  const unique = join(dir, "c.png");
  await Promise.all([writeFile(first, "same"), writeFile(second, "same"), writeFile(unique, "different")]);

  const groups = await findExactDuplicateAssets([asset(first, "a.png"), asset(second, "b.png"), asset(unique, "c.png")]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].assets.map((item) => item.asset.asset.relativePath), ["a.png", "b.png"]);
  assert.deepEqual(groups[0].assets.map((item) => item.sizeBytes), [4, 4]);
});

test("returns no groups when all bytes differ", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gae-duplicates-"));
  const first = join(dir, "a.png");
  const second = join(dir, "b.png");
  await Promise.all([writeFile(first, "one"), writeFile(second, "two")]);
  assert.deepEqual(await findExactDuplicateAssets([asset(first, "a.png"), asset(second, "b.png")]), []);
});
