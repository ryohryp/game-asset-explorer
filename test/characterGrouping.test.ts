import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyAssetTypeMetadata,
  getCharacterAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
  setCharacterAssignment,
} from "../src/core/assetTypeMetadata";
import {
  groupWorkspaceAssetsByCharacter,
  UNASSIGNED_CHARACTER_KEY,
} from "../src/characterGrouping";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(path: string, type?: string): WorkspaceAsset {
  const fileName = path.split("/").at(-1) ?? path;
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: { absolutePath: `/game/${path}`, relativePath: path, fileName, fileType: "png" },
    ...(type ? { assetType: type } : {}),
  };
}

describe("character metadata", () => {
  it("loads existing type-only schemaVersion 1 files as character-empty metadata", () => {
    const metadata = parseAssetTypeMetadata(JSON.stringify({
      schemaVersion: 1,
      assignments: { "assets/alice.png": "Character" },
    }));

    assert.equal(metadata.assignments["assets/alice.png"], "Character");
    assert.deepEqual(metadata.characters, {});
  });

  it("assigns, changes, clears, and serializes characters without losing type metadata", () => {
    let metadata = createEmptyAssetTypeMetadata();
    metadata.assignments["assets/alice.png"] = "Character";
    metadata = setCharacterAssignment(metadata, "assets/alice.png", " Alice ");
    assert.equal(getCharacterAssignment(metadata, "assets/alice.png"), "Alice");

    metadata = setCharacterAssignment(metadata, "assets/alice.png", "Hero Alice");
    assert.equal(getCharacterAssignment(metadata, "assets/alice.png"), "Hero Alice");
    assert.equal(parseAssetTypeMetadata(serializeAssetTypeMetadata(metadata)).assignments["assets/alice.png"], "Character");

    metadata = setCharacterAssignment(metadata, "assets/alice.png", undefined);
    assert.equal(getCharacterAssignment(metadata, "assets/alice.png"), undefined);
  });

  it("rejects unsafe paths and invalid character values", () => {
    const metadata = createEmptyAssetTypeMetadata();
    assert.throws(() => setCharacterAssignment(metadata, "../alice.png", "Alice"));
    assert.throws(() => setCharacterAssignment(metadata, "assets/alice.png", "Alice\nBob"));
    assert.throws(() => setCharacterAssignment(metadata, "assets/alice.png", "x".repeat(81)));
  });
});

describe("character grouping", () => {
  it("groups the same character across asset types and leaves unassigned explicit", () => {
    let metadata = createEmptyAssetTypeMetadata();
    metadata = setCharacterAssignment(metadata, "assets/alice-standing.png", "Alice");
    metadata = setCharacterAssignment(metadata, "assets/alice-angry.png", "Alice");
    const assets = [
      asset("assets/alice-standing.png", "Character"),
      asset("assets/alice-angry.png", "Expression"),
      asset("assets/background.png", "Background"),
    ];

    const groups = groupWorkspaceAssetsByCharacter(assets, new Map([["file:///game", metadata]]));
    assert.deepEqual(groups.map((group) => [group.key, group.assets.length]), [["Alice", 2], [UNASSIGNED_CHARACTER_KEY, 1]]);
  });

  it("groups only the pre-filtered input subset", () => {
    let metadata = createEmptyAssetTypeMetadata();
    metadata = setCharacterAssignment(metadata, "assets/alice-angry.png", "Alice");
    metadata = setCharacterAssignment(metadata, "assets/alice-smile.png", "Alice");

    const groups = groupWorkspaceAssetsByCharacter(
      [asset("assets/alice-angry.png", "Expression")],
      new Map([["file:///game", metadata]]),
    );
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].assets.map((item) => item.asset.relativePath), ["assets/alice-angry.png"]);
  });
});
