import assert from "node:assert/strict";
import test from "node:test";
import {
  AssetTypeMetadataError,
  createEmptyAssetTypeMetadata,
  getAssetTypeAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
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
  }));

  assert.equal(getAssetTypeAssignment(metadata, "assets/hero.png", rpg), "Character");
  assert.equal(
    serializeAssetTypeMetadata(metadata),
    '{\n  "schemaVersion": 1,\n  "assignments": {\n    "assets/hero.png": "Character",\n    "assets/ui/menu.png": "UI"\n  }\n}\n',
  );
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
