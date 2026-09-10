import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetProfile } from "../src/core/assetProfiles";
import {
  loadWorkspaceAssetTypes,
  updateWorkspaceAssetType,
  type WorkspaceAssetTypeStore,
} from "../src/assetTypeWorkspace";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(workspaceFolderUri: string, relativePath: string): WorkspaceAsset {
  return {
    workspaceFolderUri,
    workspaceFolderName: workspaceFolderUri,
    asset: {
      absolutePath: `${workspaceFolderUri}/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType: "png",
    },
  };
}

function memoryStore(initial: Record<string, string> = {}): WorkspaceAssetTypeStore & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    read: async (workspaceFolderUri) => values[workspaceFolderUri],
    write: async (workspaceFolderUri, text) => {
      values[workspaceFolderUri] = text;
    },
  };
}

test("loads only active-profile assignments and keeps workspaces isolated", async () => {
  const store = memoryStore({
    "file:///game-a": JSON.stringify({
      schemaVersion: 1,
      assignments: {
        "assets/hero.png": "Character",
        "assets/card.png": "Card",
      },
    }),
    "file:///game-b": JSON.stringify({
      schemaVersion: 1,
      assignments: { "assets/hero.png": "Enemy" },
    }),
  });

  const loaded = await loadWorkspaceAssetTypes([
    asset("file:///game-a", "assets/hero.png"),
    asset("file:///game-a", "assets/card.png"),
    asset("file:///game-b", "assets/hero.png"),
  ], resolveAssetProfile("rpg"), store);

  assert.deepEqual(loaded.map((item) => item.assetType), ["Character", undefined, "Enemy"]);
});

test("writes a Git-friendly assignment and clears it back to Uncategorized", async () => {
  const store = memoryStore();
  const selected = asset("file:///game", "assets/hero.png");
  const profile = resolveAssetProfile("rpg");

  await updateWorkspaceAssetType(selected, "Character", profile, store);
  assert.match(store.values["file:///game"], /"assets\/hero.png": "Character"/);

  await updateWorkspaceAssetType(selected, undefined, profile, store);
  assert.doesNotMatch(store.values["file:///game"], /assets\/hero\.png/);
});
