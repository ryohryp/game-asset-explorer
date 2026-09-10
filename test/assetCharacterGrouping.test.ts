import assert from "node:assert/strict";
import test from "node:test";
import {
  groupWorkspaceAssetsByCharacter,
  listCharacterNames,
  UNASSIGNED_CHARACTER_LABEL,
} from "../src/core/assetCharacterGrouping";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, character?: string, assetType?: string): WorkspaceAsset {
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: {
      absolutePath: `/game/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType: "png",
    },
    ...(character ? { character } : {}),
    ...(assetType ? { assetType } : {}),
  };
}

test("groups one character across asset types and folders", () => {
  const groups = groupWorkspaceAssetsByCharacter([
    asset("characters/alice/standing.png", "Alice", "Character"),
    asset("expressions/alice-angry.png", "Alice", "Expression"),
    asset("ui/alice-icon.png", "Alice", "Icon"),
    asset("characters/bob.png", "Bob", "Character"),
  ]);

  assert.deepEqual(groups.map((group) => [group.label, group.assets.length]), [
    ["Alice", 3],
    ["Bob", 1],
  ]);
  assert.deepEqual(groups[0].assets.map((item) => item.assetType), ["Character", "Expression", "Icon"]);
});

test("puts assets without a character in an explicit Unassigned group", () => {
  const groups = groupWorkspaceAssetsByCharacter([
    asset("characters/alice.png", "Alice"),
    asset("ui/unknown.png"),
  ]);
  assert.equal(groups.at(-1)?.label, UNASSIGNED_CHARACTER_LABEL);
  assert.deepEqual(groups.at(-1)?.assets.map((item) => item.asset.relativePath), ["ui/unknown.png"]);
});

test("lists existing character values uniquely and deterministically", () => {
  assert.deepEqual(listCharacterNames([
    asset("b.png", "Bob"),
    asset("a2.png", "Alice"),
    asset("a1.png", "Alice"),
    asset("none.png"),
  ]), ["Alice", "Bob"]);
});
