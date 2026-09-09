import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAssetDetails } from "../src/core/assetDetails";
import { AssetRecord } from "../src/core/assetScanner";

async function withTempDir(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "game-asset-explorer-details-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function makeAsset(absolutePath: string): AssetRecord {
  return {
    absolutePath,
    relativePath: "assets/hero.png",
    fileName: "hero.png",
    fileType: "png",
  };
}

test("loadAssetDetails returns cheap filesystem metadata for an existing file", async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, "hero.png");
    const contents = Buffer.from("fake-png-bytes");
    await writeFile(filePath, contents);

    const result = await loadAssetDetails(makeAsset(filePath));

    assert.equal(result.status, "available");
    if (result.status === "available") {
      assert.equal(result.details.sizeBytes, contents.length);
      assert.equal(typeof result.details.modifiedAt, "number");
      assert.ok(result.details.modifiedAt > 0);
    }
  });
});

test("loadAssetDetails returns a recoverable missing state when the file disappeared", async () => {
  await withTempDir(async (directory) => {
    const missingPath = path.join(directory, "missing.png");

    const result = await loadAssetDetails(makeAsset(missingPath));

    assert.deepEqual(result, { status: "missing" });
  });
});
