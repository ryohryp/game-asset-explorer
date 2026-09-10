import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCustomAssetTypes,
  resolveAssetProfile,
} from "../src/core/assetProfiles";

test("resolves practical built-in genre profiles", () => {
  assert.deepEqual(resolveAssetProfile("rpg").assetTypes, [
    "Character", "Enemy", "NPC", "Item", "Weapon", "Armor", "Skill", "Map", "UI", "Effect",
  ]);
  assert.deepEqual(resolveAssetProfile("visual-novel").assetTypes, [
    "Character", "Expression", "Background", "CG", "UI", "Effect",
  ]);
  assert.deepEqual(resolveAssetProfile("card-game").assetTypes, [
    "Card", "Character", "Frame", "Icon", "Effect", "Background",
  ]);
});

test("falls back to Generic for an unknown configured profile", () => {
  const profile = resolveAssetProfile("unknown-profile");
  assert.equal(profile.id, "generic");
  assert.equal(profile.label, "Generic");
  assert.ok(profile.assetTypes.includes("Character"));
  assert.ok(profile.assetTypes.includes("Other"));
});

test("normalizes custom types without duplicate or unsafe sentinel values", () => {
  assert.deepEqual(
    normalizeCustomAssetTypes([" Portrait ", "portrait", "Icon", "", "__uncategorized__"]),
    ["Portrait", "Icon"],
  );

  const profile = resolveAssetProfile("custom", ["Portrait", "Map Overlay"]);
  assert.equal(profile.label, "Custom");
  assert.deepEqual(profile.assetTypes, ["Portrait", "Map Overlay"]);
});
