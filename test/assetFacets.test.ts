import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssetFacetOptions,
  filterWorkspaceAssetsByFacets,
  reconcileAssetFacetSelection,
} from "../src/assetFacets";
import { AssetFileType } from "../src/core/assetScanner";
import { WorkspaceAsset } from "../src/workspaceAsset";

function asset(
  workspaceFolderName: string,
  workspaceFolderUri: string,
  relativePath: string,
  fileType: AssetFileType,
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
  };
}

const assets: WorkspaceAsset[] = [
  asset("game", "file:///game", "assets/characters/hero.png", "png"),
  asset("game", "file:///game", "assets/characters/villain.webp", "webp"),
  asset("game", "file:///game", "assets/ui/menu.png", "png"),
  asset("tools", "file:///tools", "assets/ui/icon.jpg", "jpg"),
];

test("filters by folder and file type without a text query", () => {
  assert.deepEqual(
    filterWorkspaceAssetsByFacets(assets, "", { folder: "assets/characters", fileType: "png" })
      .map((item) => item.asset.relativePath),
    ["assets/characters/hero.png"],
  );
});

test("combines text search with facets", () => {
  assert.deepEqual(
    filterWorkspaceAssetsByFacets(assets, "ui", { fileType: "png", workspaceFolderUri: "file:///game" })
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

test("builds deterministic filesystem-derived facet counts", () => {
  assert.deepEqual(buildAssetFacetOptions(assets), {
    folders: [
      { value: "assets/characters", label: "assets/characters", count: 2 },
      { value: "assets/ui", label: "assets/ui", count: 2 },
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

test("drops facet selections that no longer exist after a refresh", () => {
  assert.deepEqual(
    reconcileAssetFacetSelection(
      { folder: "assets/missing", fileType: "png", workspaceFolderUri: "file:///tools" },
      assets.slice(0, 3),
    ),
    { folder: undefined, fileType: "png", workspaceFolderUri: undefined },
  );
});
