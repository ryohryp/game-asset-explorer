import assert from "node:assert/strict";
import test from "node:test";
import {
  AssetTypeMetadataError,
  createEmptyAssetTypeMetadata,
  getAssetSubtypeAssignment,
  getAssetTypeAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
  setAssetSubtypeAssignment,
  setAssetTypeAssignment,
} from "../src/core/assetTypeMetadata";
import { resolveAssetProfile } from "../src/core/assetProfiles";

const rpg = resolveAssetProfile("rpg");

test("parses and serializes path-keyed asset type metadata deterministically", () => {
  const metadata = parseAssetTypeMetadata(JSON.stringify({
    schemaVersion: 1,
    assignments: {
      "assets/ui/menu.png": "UI",
      "assets/hero.png": "Character",
    },
    subtypes: {
      "assets/hero.png": "portrait",
    },
  }));

  assert.equal(getAssetTypeAssignment(metadata, "assets/hero.png", rpg), "Character");
  assert.equal(getAssetSubtypeAssignment(metadata, "assets/hero.png", rpg), "portrait");
  assert.equal(
    serializeAssetTypeMetadata(metadata),
    '{\n  "schemaVersion": 1,\n  "assignments": {\n    "assets/hero.png": "Character",\n    "assets/ui/menu.png": "UI"\n  },\n  "subtypes": {\n    "assets/hero.png": "portrait"\n  }\n}\n',
  );
});

test("keeps existing schemaVersion 1 files without subtype metadata backward compatible", () => {
  const metadata = parseAssetTypeMetadata(JSON.stringify({
    schemaVersion: 1,
    assignments: { "assets/hero.png": "Character" },
  }));

  assert.equal(getAssetTypeAssignment(metadata, "assets/hero.png", rpg), "Character");
  assert.equal(getAssetSubtypeAssignment(metadata, "assets/hero.png", rpg), undefined);
});

test("treats assignments outside the active profile as Uncategorized without deleting metadata", () => {
  const metadata = parseAssetTypeMetadata(JSON.stringify({
    schemaVersion: 1,
    assignments: { "assets/card.png": "Card" },
  }));

  assert.equal(getAssetTypeAssignment(metadata, "assets/card.png", rpg), undefined);
  assert.equal(getAssetTypeAssignment(metadata, "assets/card.png", resolveAssetProfile("card-game")), "Card");
});

test("updates and clears only the selected path assignment", () => {
  const assigned = setAssetTypeAssignment(
    createEmptyAssetTypeMetadata(),
    "assets/hero.png",
    "Character",
    rpg,
  );
  assert.equal(assigned.assignments["assets/hero.png"], "Character");

  const cleared = setAssetTypeAssignment(assigned, "assets/hero.png", undefined, rpg);
  assert.deepEqual(cleared.assignments, {});
});

test("validates subtype assignments against the assigned type and active profile", () => {
  const typed = setAssetTypeAssignment(createEmptyAssetTypeMetadata(), "assets/hero.png", "Character", rpg);
  const withSubtype = setAssetSubtypeAssignment(typed, "assets/hero.png", "attack", rpg);
  assert.equal(getAssetSubtypeAssignment(withSubtype, "assets/hero.png", rpg), "attack");

  assert.throws(
    () => setAssetSubtypeAssignment(typed, "assets/hero.png", "front", rpg),
    /not available for Asset Type 'Character'/,
  );
  assert.throws(
    () => setAssetSubtypeAssignment(createEmptyAssetTypeMetadata(), "assets/hero.png", "attack", rpg),
    /Assign an Asset Type/,
  );
});

test("clears a stale subtype when the asset type changes", () => {
  let metadata = setAssetTypeAssignment(createEmptyAssetTypeMetadata(), "assets/hero.png", "Character", rpg);
  metadata = setAssetSubtypeAssignment(metadata, "assets/hero.png", "attack", rpg);
  metadata = setAssetTypeAssignment(metadata, "assets/hero.png", "UI", rpg);

  assert.equal(getAssetTypeAssignment(metadata, "assets/hero.png", rpg), "UI");
  assert.equal(metadata.subtypes, undefined);
});

test("rejects invalid paths and asset types not allowed by the active profile", () => {
  assert.throws(
    () => setAssetTypeAssignment(createEmptyAssetTypeMetadata(), "../hero.png", "Character", rpg),
    AssetTypeMetadataError,
  );
  assert.throws(
    () => setAssetTypeAssignment(createEmptyAssetTypeMetadata(), "assets/hero.png", "Card", rpg),
    /not available in the active RPG profile/,
  );
  assert.throws(
    () => parseAssetTypeMetadata('{"schemaVersion":1,"assignments":{"assets/readme.txt":"UI"}}'),
    /Invalid asset path/,
  );
});
