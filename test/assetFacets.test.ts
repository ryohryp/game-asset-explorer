import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssetFacetOptions,
  filterWorkspaceAssetsByFacets,
  filterWorkspaceAssetsForSearch,
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

const unexpectedLoaders = {
  sizeBytes: async (): Promise<number> => { throw new Error("Unexpected size read"); },
  problems: async (): Promise<WorkspaceAsset[]> => { throw new Error("Unexpected Problems read"); },
};

test("ordinary search and clear never load size or Problems state", async () => {
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "HERO", { fileType: "png" }, unexpectedLoaders), [assets[0]]);
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "", {}, unexpectedLoaders), assets);
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "absent", { size: "under-1-mib", state: "problems" }, unexpectedLoaders), []);
});

test("loads size after all cheap facets, then Problems only for size matches", async () => {
  const sizeReads: WorkspaceAsset[] = [];
  const problemReads: WorkspaceAsset[][] = [];
  const selected = assets[0];
  const sameFolder = { ...selected, asset: { ...selected.asset, relativePath: "assets/characters/hero-small.png", fileName: "hero-small.png" } };
  const otherWorkspace = { ...selected, workspaceFolderUri: "file:///elsewhere" };
  const otherType = { ...selected, assetType: "Enemy" };
  const otherFormat = { ...selected, asset: { ...selected.asset, fileType: "webp" as const } };
  const otherFolder = { ...selected, asset: { ...selected.asset, relativePath: "other/hero.png" } };
  const result = await filterWorkspaceAssetsForSearch(
    [...assets, sameFolder, otherWorkspace, otherType, otherFormat, otherFolder], "hero",
    { folder: "assets/characters", fileType: "png", assetType: "Character", workspaceFolderUri: "file:///game", size: "at-least-1-mib", state: "problems" },
    {
      sizeBytes: async (asset) => { sizeReads.push(asset); return asset === selected ? 1024 * 1024 : 1; },
      problems: async (candidates) => { problemReads.push([...candidates]); return candidates; },
    },
  );
  assert.deepEqual(sizeReads, [selected, sameFolder]);
  assert.deepEqual(problemReads, [[selected]]);
  assert.deepEqual(result, [selected]);
  assert.equal(result[0], selected, "preserves the asset used by normal Details selection");
});

test("size presets include exact binary boundaries and reread on each request", async () => {
  const bytes = [0, 1024 * 1024 - 1, 1024 * 1024, 5 * 1024 * 1024];
  let reads = 0;
  const loaders = { ...unexpectedLoaders, sizeBytes: async (asset: WorkspaceAsset) => { reads++; return bytes[assets.indexOf(asset)]; } };
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "", { size: "under-1-mib" }, loaders), assets.slice(0, 2));
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "", { size: "at-least-1-mib" }, loaders), assets.slice(2));
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "", { size: "at-least-5-mib" }, loaders), assets.slice(3));
  assert.equal(reads, 12);
});

test("Problems-only filtering needs no size read and keeps workspace identity", async () => {
  const samePath = { ...assets[0], workspaceFolderUri: "file:///other" };
  const loaders = { ...unexpectedLoaders, problems: async () => [samePath] };
  assert.deepEqual(await filterWorkspaceAssetsForSearch([assets[0], samePath], "", { state: "problems" }, loaders), [samePath]);
});

test("does not inspect Problems after size excludes every candidate", async () => {
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "", { size: "at-least-1-mib", state: "problems" }, {
    ...unexpectedLoaders, sizeBytes: async () => 0,
  }), []);
});

test("propagates unavailable metadata/state instead of reporting clean results", async () => {
  await assert.rejects(filterWorkspaceAssetsForSearch(assets, "", { size: "under-1-mib" }, unexpectedLoaders), /Unexpected size read/);
  await assert.rejects(filterWorkspaceAssetsForSearch(assets, "", { state: "problems" }, unexpectedLoaders), /Unexpected Problems read/);
});

test("stops superseded requests before further file or state reads", async () => {
  let current = true;
  let reads = 0;
  assert.deepEqual(await filterWorkspaceAssetsForSearch(assets, "", { size: "under-1-mib", state: "problems" }, {
    ...unexpectedLoaders,
    sizeBytes: async () => { current = false; reads++; return 0; },
  }, () => current), []);
  assert.equal(reads, 1);
});

test("retains size and state filters across empty scans so new files can match", () => {
  const selection = reconcileAssetFacetSelection({ size: "at-least-5-mib", state: "problems" }, []);
  assert.equal(selection.size, "at-least-5-mib");
  assert.equal(selection.state, "problems");
});
