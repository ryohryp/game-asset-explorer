import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetCategorySummary } from "../src/core/assetCategorySummary";
import { resolveAssetProfile } from "../src/core/assetProfiles";

test("shows expected zero-count subtype slots alongside populated slots", () => {
  const summary = buildAssetCategorySummary(resolveAssetProfile("rpg"), [
    { assetType: "Character", assetSubtype: "portrait" },
    { assetType: "Character", assetSubtype: "portrait" },
    { assetType: "Character" },
    { assetType: "Enemy", assetSubtype: "idle" },
    {},
  ]);

  const character = summary.categories.find((category) => category.assetType === "Character");
  assert.ok(character);
  assert.equal(character.count, 3);
  assert.equal(character.unsetSubtypeCount, 1);
  assert.deepEqual(character.subtypes, [
    { subtype: "portrait", count: 2 },
    { subtype: "standing", count: 0 },
    { subtype: "idle", count: 0 },
    { subtype: "attack", count: 0 },
    { subtype: "damage", count: 0 },
  ]);
  assert.equal(summary.uncategorizedCount, 1);
});

test("includes project-added categories and their customized slots", () => {
  const profile = resolveAssetProfile("rpg", [], {
    addAssetTypes: ["Quest Art"],
    subtypes: { "Quest Art": ["chapter", "reward"] },
  });
  const summary = buildAssetCategorySummary(profile, [{ assetType: "Quest Art", assetSubtype: "reward" }]);
  const questArt = summary.categories.find((category) => category.assetType === "Quest Art");

  assert.deepEqual(questArt, {
    assetType: "Quest Art",
    count: 1,
    subtypes: [
      { subtype: "chapter", count: 0 },
      { subtype: "reward", count: 1 },
    ],
    unsetSubtypeCount: 0,
  });
});
