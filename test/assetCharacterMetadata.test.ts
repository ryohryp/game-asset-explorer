import assert from "node:assert/strict";
import test from "node:test";
import {
  AssetTypeMetadataError,
  createEmptyAssetTypeMetadata,
  getAssetCharacterAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
  setAssetCharacterAssignment,
  setAssetTypeAssignment,
} from "../src/core/assetTypeMetadata";
import { resolveAssetProfile } from "../src/core/assetProfiles";

test("parses and serializes character assignments beside asset types", () => {
  const metadata = parseAssetTypeMetadata(JSON.stringify({
    schemaVersion: 1,
    assignments: { "assets/alice.png": "Character" },
    characters: {
      "assets/alice.png": " Alice ",
      "assets/alice-angry.png": "Alice",
    },
  }));
  assert.equal(getAssetCharacterAssignment(metadata, "assets/alice.png"), "Alice");
  assert.match(serializeAssetTypeMetadata(metadata), /"characters"/);
  assert.match(serializeAssetTypeMetadata(metadata), /"assets\/alice-angry.png": "Alice"/);
});

test("type updates preserve character assignments", () => {
  const withCharacter = setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "assets/alice.png", "Alice");
  const withType = setAssetTypeAssignment(withCharacter, "assets/alice.png", "Character", resolveAssetProfile("rpg"));
  assert.equal(getAssetCharacterAssignment(withType, "assets/alice.png"), "Alice");
});

test("clears character independently and validates names", () => {
  const assigned = setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "assets/alice.png", "Alice");
  const cleared = setAssetCharacterAssignment(assigned, "assets/alice.png", undefined);
  assert.equal(getAssetCharacterAssignment(cleared, "assets/alice.png"), undefined);
  assert.doesNotMatch(serializeAssetTypeMetadata(cleared), /"characters"/);
  assert.throws(
    () => setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "assets/alice.png", "   "),
    AssetTypeMetadataError,
  );
  assert.throws(
    () => setAssetCharacterAssignment(createEmptyAssetTypeMetadata(), "../alice.png", "Alice"),
    AssetTypeMetadataError,
  );
});
