import assert from "node:assert/strict";
import test from "node:test";
import { createExplorationState, reconcileExplorationState } from "../src/explorationState";
import { AssetRecord } from "../src/core/assetScanner";
import { getWorkspaceAssetIdentity, WorkspaceAsset } from "../src/workspaceAsset";

function workspaceAsset(relativePath: string): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  const asset: AssetRecord = {
    absolutePath: `/workspace/${relativePath}`,
    relativePath,
    fileName,
    fileType: fileName.toLowerCase().endsWith(".jpg") ? "jpg" : "png",
  };
  return {
    workspaceFolderUri: "file:///workspace",
    workspaceFolderName: "workspace",
    asset,
  };
}

test("creates an empty ephemeral exploration state", () => {
  assert.deepEqual(createExplorationState(), { query: "", scrollY: 0 });
});

test("preserves query, scroll position, and an available selection across refresh", () => {
  const selected = workspaceAsset("assets/ui/menu-button.png");
  const state = reconcileExplorationState({
    query: "menu",
    selectedIdentity: getWorkspaceAssetIdentity(selected),
    scrollY: 420,
  }, [selected]);

  assert.equal(state.query, "menu");
  assert.equal(state.scrollY, 420);
  assert.equal(state.selectedIdentity, getWorkspaceAssetIdentity(selected));
  assert.equal(state.selectionStatus, "available");
});

test("keeps a deleted selection explicit instead of substituting another asset", () => {
  const selected = workspaceAsset("assets/hero.png");
  const replacement = workspaceAsset("assets/villain.png");
  const state = reconcileExplorationState({
    query: "",
    selectedIdentity: getWorkspaceAssetIdentity(selected),
    scrollY: 100,
  }, [replacement]);

  assert.equal(state.selectedIdentity, getWorkspaceAssetIdentity(selected));
  assert.equal(state.selectionStatus, "missing");
});

test("normalizes invalid scroll positions without changing the active query", () => {
  const state = reconcileExplorationState({ query: "forest", scrollY: Number.NaN }, []);
  assert.equal(state.query, "forest");
  assert.equal(state.scrollY, 0);
  assert.equal(state.selectionStatus, "none");
});
