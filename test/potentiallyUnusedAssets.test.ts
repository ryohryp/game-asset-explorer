import assert from "node:assert/strict";
import test from "node:test";
import { findPotentiallyUnusedAssets } from "../src/core/potentiallyUnusedAssets";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string): WorkspaceAsset {
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: { absolutePath: `/game/${relativePath}`, relativePath, fileName: relativePath.split("/").at(-1)!, fileType: "png" },
  };
}

test("returns assets without direct workspace-relative references", () => {
  const assets = [asset("assets/hero.png"), asset("assets/unused.png")];
  const result = findPotentiallyUnusedAssets(assets, ["const hero = './assets/hero.png';"]);
  assert.deepEqual(result.map((item) => item.asset.relativePath), ["assets/unused.png"]);
});

test("does not treat dynamic references as proof of usage", () => {
  const assets = [asset("assets/hero.png")];
  assert.deepEqual(findPotentiallyUnusedAssets(assets, ["`assets/${name}.png`"]), assets);
});
