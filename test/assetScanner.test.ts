import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { scanAssets } from "../src/core/assetScanner";

async function createWorkspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "game-asset-explorer-"));
}

test("recursively discovers supported image files and filters unsupported files", async () => {
  const workspaceRoot = await createWorkspace();

  try {
    await mkdir(path.join(workspaceRoot, "assets", "ui"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "assets", "hero.png"), "png");
    await writeFile(path.join(workspaceRoot, "assets", "portrait.jpeg"), "jpeg");
    await writeFile(path.join(workspaceRoot, "assets", "ui", "button.JPG"), "jpg");
    await writeFile(path.join(workspaceRoot, "assets", "ui", "panel.webp"), "webp");
    await writeFile(path.join(workspaceRoot, "assets", "ui", "spark.gif"), "gif");
    await writeFile(path.join(workspaceRoot, "assets", "notes.txt"), "not an image");
    await writeFile(path.join(workspaceRoot, "assets", "legacy.bmp"), "unsupported");

    const result = await scanAssets({ workspaceRoot, assetDirectories: ["assets"] });

    assert.deepEqual(
      result.assets.map((asset) => asset.relativePath),
      [
        "assets/hero.png",
        "assets/portrait.jpeg",
        "assets/ui/button.JPG",
        "assets/ui/panel.webp",
        "assets/ui/spark.gif",
      ],
    );
    assert.deepEqual(result.assets.map((asset) => asset.fileType), ["png", "jpeg", "jpg", "webp", "gif"]);
    assert.deepEqual(result.warnings, []);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("continues scanning valid directories when another configured directory is missing", async () => {
  const workspaceRoot = await createWorkspace();

  try {
    await mkdir(path.join(workspaceRoot, "assets"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "assets", "hero.png"), "png");

    const result = await scanAssets({
      workspaceRoot,
      assetDirectories: ["missing", "assets"],
    });

    assert.equal(result.assets.length, 1);
    assert.equal(result.assets[0]?.relativePath, "assets/hero.png");
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /missing/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("warns and skips a configured path that is not a directory", async () => {
  const workspaceRoot = await createWorkspace();

  try {
    await writeFile(path.join(workspaceRoot, "asset-file"), "not a directory");

    const result = await scanAssets({
      workspaceRoot,
      assetDirectories: ["asset-file"],
    });

    assert.deepEqual(result.assets, []);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /not a directory/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
