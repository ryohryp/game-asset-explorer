import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetProfile } from "../src/core/assetProfiles";
import {
  loadWorkspaceAssetTypes,
  updateWorkspaceAssetType,
  updateWorkspaceAssetTypes,
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


test("bulk type assignment updates only provided Uncategorized assets and preserves other assignments", async () => {
  const store = memoryStore({
    "file:///game": JSON.stringify({ schemaVersion: 1, assignments: { "assets/backgrounds/already.png": "Background", "assets/icons/keep.png": "UI" } }),
  });
  const profile = resolveAssetProfile("generic");
  const first = asset("file:///game", "assets/backgrounds/one.png");
  const second = asset("file:///game", "assets/backgrounds/two.png");
  const alreadyTyped = { ...asset("file:///game", "assets/backgrounds/already.png"), assetType: "Background" };
  const count = await updateWorkspaceAssetTypes([first, second, alreadyTyped], "Background", profile, store);
  assert.equal(count, 2);
  const text = store.values["file:///game"];
  assert.match(text, /"assets\/backgrounds\/one.png": "Background"/);
  assert.match(text, /"assets\/backgrounds\/two.png": "Background"/);
  assert.match(text, /"assets\/backgrounds\/already.png": "Background"/);
  assert.match(text, /"assets\/icons\/keep.png": "UI"/);
});

test("bulk type assignment refuses to cross workspace boundaries", async () => {
  const store = memoryStore();
  await assert.rejects(() => updateWorkspaceAssetTypes([
    asset("file:///game-a", "assets/a.png"), asset("file:///game-b", "assets/b.png"),
  ], "Background", resolveAssetProfile("generic"), store), /one workspace/);
});
