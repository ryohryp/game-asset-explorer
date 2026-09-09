import assert from "node:assert/strict";
import test from "node:test";
import { filterAssets } from "../src/core/assetSearch";
import { AssetRecord } from "../src/core/assetScanner";
import { filterWorkspaceAssets, getWorkspaceAssetIdentity, WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string): AssetRecord {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    absolutePath: `/workspace/${relativePath}`,
    relativePath,
    fileName,
    fileType: fileName.toLowerCase().endsWith(".jpg") ? "jpg" : "png",
  };
}

const assets = [
  asset("assets/characters/HeroPortrait.png"),
  asset("assets/ui/menu-button.png"),
  asset("backgrounds/forest.jpg"),
];

test("filters assets by filename case-insensitively", () => {
  assert.deepEqual(
    filterAssets(assets, "HEROPORTRAIT").map((item) => item.relativePath),
    ["assets/characters/HeroPortrait.png"],
  );
});

test("filters assets by partial relative path case-insensitively", () => {
  assert.deepEqual(
    filterAssets(assets, "UI/MENU").map((item) => item.relativePath),
    ["assets/ui/menu-button.png"],
  );
});

test("clearing the query restores all discovered assets", () => {
  assert.deepEqual(filterAssets(assets, ""), assets);
  assert.deepEqual(filterAssets(assets, "   "), assets);
});

test("workspace identity distinguishes equal relative paths in different workspace folders", () => {
  const sharedAsset = asset("assets/hero.png");
  const first: WorkspaceAsset = {
    workspaceFolderUri: "file:///workspace-a",
    workspaceFolderName: "workspace-a",
    asset: sharedAsset,
  };
  const second: WorkspaceAsset = {
    workspaceFolderUri: "file:///workspace-b",
    workspaceFolderName: "workspace-b",
    asset: { ...sharedAsset, absolutePath: "/workspace-b/assets/hero.png" },
  };

  assert.notEqual(getWorkspaceAssetIdentity(first), getWorkspaceAssetIdentity(second));
  assert.equal(filterWorkspaceAssets([first, second], "hero").length, 2);
});
