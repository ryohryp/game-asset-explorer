import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssetFacetOptions,
  filterWorkspaceAssetsByFacets,
  reconcileAssetFacetSelection,
} from "../src/assetFacets";
import { UNCATEGORIZED_ASSET_TYPE } from "../src/core/assetProfiles";
import { AssetFileType } from "../src/core/assetScanner";
import { WorkspaceAsset } from "../src/workspaceAsset";

function asset(
  workspaceFolderName: string,
  workspaceFolderUri: string,
  relativePath: string,
  fileType: AssetFileType,
  assetType?: string,
): WorkspaceAsset {
  return {
    workspaceFolderName,
    workspaceFolderUri,
    asset: {
      absolutePath: `/${workspaceFolderName}/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType,
    },
    ...(assetType ? { assetType } : {}),
  };
}

const assets: WorkspaceAsset[] = [
  asset("game", "file:///game", "assets/characters/hero.png", "png", "Character"),
  asset("game", "file:///game", "assets/characters/villain.webp", "webp", "Enemy"),
  asset("game", "file:///game", "assets/ui/menu.png", "png", "UI"),
  asset("tools", "file:///tools", "assets/ui/icon.jpg", "jpg"),
];

test("filters by folder and file type without a text query", () => {
  assert.deepEqual(
    filterWorkspaceAssetsByFacets(assets, "", { folder: "assets/characters", fileType: "png" })
      .map((item) => item.asset.relativePath),
    ["assets/characters/hero.png"],
  );
});

test("filters by semantic asset type including Uncategorized", () => {
  assert.deepEqual(
    filterWorkspaceAssetsByFacets(assets, "", { assetType: "Enemy" })
      .map((item) => item.asset.relativePath),
    ["assets/characters/villain.webp"],
  );
  assert.deepEqual(
    filterWorkspaceAssetsByFacets(assets, "", { assetType: UNCATEGORIZED_ASSET_TYPE })
      .map((item) => item.asset.relativePath),
    ["assets/ui/icon.jpg"],
  );
});

test("combines text search with facets", () => {
  assert.deepEqual(
    filterWorkspaceAssetsByFacets(assets, "ui", { assetType: "UI", fileType: "png", workspaceFolderUri: "file:///game" })
      .map((item) => item.asset.relativePath),
    ["assets/ui/menu.png"],
  );
});

test("clearing facets restores text-query results", () => {
  const withFacet = filterWorkspaceAssetsByFacets(assets, "assets", { fileType: "webp" });
  const withoutFacet = filterWorkspaceAssetsByFacets(assets, "assets", {});

  assert.equal(withFacet.length, 1);
  assert.deepEqual(withoutFacet, assets);
});

test("builds deterministic profile-aware facet counts", () => {
  assert.deepEqual(buildAssetFacetOptions(assets, ["Character", "Enemy", "NPC", "UI"]), {
    folders: [
      { value: "assets/characters", label: "assets/characters", count: 2 },
      { value: "assets/ui", label: "assets/ui", count: 2 },
    ],
    assetTypes: [
      { value: "Character", label: "Character", count: 1 },
      { value: "Enemy", label: "Enemy", count: 1 },
      { value: "NPC", label: "NPC", count: 0 },
      { value: "UI", label: "UI", count: 1 },
      { value: UNCATEGORIZED_ASSET_TYPE, label: "Uncategorized", count: 1 },
    ],
    fileTypes: [
      { value: "jpg", label: "JPG", count: 1 },
      { value: "png", label: "PNG", count: 2 },
      { value: "webp", label: "WEBP", count: 1 },
    ],
    workspaces: [
      { value: "file:///game", label: "game", count: 3 },
      { value: "file:///tools", label: "tools", count: 1 },
    ],
  });
});

test("drops facet selections that no longer exist after a refresh or profile change", () => {
  assert.deepEqual(
    reconcileAssetFacetSelection(
      {
        folder: "assets/missing",
        assetType: "Enemy",
        fileType: "png",
        workspaceFolderUri: "file:///tools",
      },
      assets.slice(0, 3),
      ["Character", "UI"],
    ),
    { folder: undefined, assetType: undefined, fileType: "png", workspaceFolderUri: undefined },
  );
});
