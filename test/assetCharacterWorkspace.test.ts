import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetProfile } from "../src/core/assetProfiles";
import {
  loadWorkspaceAssetTypes,
  updateWorkspaceAssetCharacter,
  type WorkspaceAssetTypeStore,
} from "../src/assetTypeWorkspace";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string): WorkspaceAsset {
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: {
      absolutePath: `/game/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType: "png",
    },
  };
}

function memoryStore(initial?: string): WorkspaceAssetTypeStore & { value?: string } {
  let value = initial;
  return {
    get value() { return value; },
    read: async () => value,
    write: async (_workspaceFolderUri, text) => { value = text; },
  };
}

test("loads character and type metadata together", async () => {
  const store = memoryStore(JSON.stringify({
    schemaVersion: 1,
    assignments: { "assets/alice.png": "Character" },
    characters: { "assets/alice.png": "Alice" },
  }));
  const loaded = await loadWorkspaceAssetTypes([asset("assets/alice.png")], resolveAssetProfile("rpg"), store);
  assert.equal(loaded[0].assetType, "Character");
  assert.equal(loaded[0].character, "Alice");
});

test("writes and clears a character without a second metadata store", async () => {
  const store = memoryStore();
  const selected = asset("assets/alice.png");
  await updateWorkspaceAssetCharacter(selected, "Alice", store);
  assert.match(store.value ?? "", /"assets\/alice.png": "Alice"/);
  await updateWorkspaceAssetCharacter(selected, undefined, store);
  assert.doesNotMatch(store.value ?? "", /"characters"/);
});
