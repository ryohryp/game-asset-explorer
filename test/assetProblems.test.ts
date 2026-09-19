import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findAssetProblems, formatAssetProblemSummary, readImageDimensions } from "../src/core/assetProblems";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(path: string): WorkspaceAsset {
  return { workspaceFolderUri: "file:///workspace", workspaceFolderName: "workspace", asset: { absolutePath: path, relativePath: "image.png", fileName: "image.png", fileType: "png" } };
}

test("reads PNG dimensions without decoding image contents", () => {
  const png = Buffer.alloc(24);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png);
  png.writeUInt32BE(320, 16);
  png.writeUInt32BE(180, 20);
  assert.deepEqual(readImageDimensions(png), { width: 320, height: 180 });
});

test("reports explicit reasons using supplied limits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gae-problems-"));
  const path = join(dir, "image.png");
  const png = Buffer.alloc(24);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png);
  png.writeUInt32BE(320, 16);
  png.writeUInt32BE(180, 20);
  await writeFile(path, png);
  const problems = await findAssetProblems([asset(path)], { maxWidth: 200, maxHeight: 200, maxSizeBytes: 10 });
  assert.equal(problems.length, 1);
  assert.deepEqual(problems[0].reasons, ["File size 24 bytes exceeds 10", "Dimensions 320×180 exceed 200×200"]);
  assert.equal(problems[0].width, 320);
  assert.equal(problems[0].height, 180);
});

test("formats multiple problem reasons for diagnostics", () => {
  assert.equal(formatAssetProblemSummary({ reasons: ["too large", "too wide"] }), "too large; too wide");
});
