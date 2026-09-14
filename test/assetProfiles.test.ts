import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssetSubtypes,
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

test("built-in profiles expose bounded expected subtype slots", () => {
  const rpg = resolveAssetProfile("rpg");
  assert.deepEqual(getAssetSubtypes(rpg, "Character"), ["portrait", "standing", "idle", "attack", "damage"]);
  assert.deepEqual(getAssetSubtypes(rpg, "Enemy"), ["idle", "attack", "damage"]);
  assert.deepEqual(getAssetSubtypes(rpg, "Background"), []);

  const visualNovel = resolveAssetProfile("visual-novel");
  assert.deepEqual(getAssetSubtypes(visualNovel, "Character"), ["standing", "expression", "portrait"]);
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

test("applies project profile overrides without changing built-in presets", () => {
  const customized = resolveAssetProfile("rpg", [], {
    addAssetTypes: ["Quest Art", "quest art"],
    removeAssetTypes: ["Armor"],
    subtypes: {
      Character: ["portrait", "battle", "battle"],
      "Quest Art": ["chapter", "reward"],
      Background: [],
    },
  });

  assert.equal(customized.assetTypes.includes("Armor"), false);
  assert.equal(customized.assetTypes.includes("Quest Art"), true);
  assert.deepEqual(getAssetSubtypes(customized, "Character"), ["portrait", "battle"]);
  assert.deepEqual(getAssetSubtypes(customized, "Quest Art"), ["chapter", "reward"]);
  assert.deepEqual(getAssetSubtypes(customized, "Background"), []);

  assert.equal(resolveAssetProfile("rpg").assetTypes.includes("Armor"), true);
  assert.deepEqual(getAssetSubtypes(resolveAssetProfile("rpg"), "Character"), [
    "portrait", "standing", "idle", "attack", "damage",
  ]);
});
