import assert from "node:assert/strict";
import test from "node:test";
import { GenerationPackageValidationError } from "../src/core/generationPackage";
import { buildNewAssetPrompt, createNewAssetPrompt } from "../src/core/newAssetPrompt";

test("builds a validated new-asset package and deterministic prompt", () => {
  const result = createNewAssetPrompt({
    assetKind: "item",
    userRequest: "炎属性の剣アイコン。RPGの装備画面用",
    output: {
      relativePath: "assets/items/fire_sword.png",
      width: 1024,
      height: 1024,
      format: "png",
      alpha: "require",
    },
    context: {
      subjectId: "rpg-items",
      constraints: ["Clear silhouette", "Readable at small sizes"],
      forbidden: ["Text", "UI frame"],
    },
  }, { availableAssetPaths: [] });

  assert.equal(result.generationPackage.intent, "new-asset");
  assert.equal(result.generationPackage.output.writeMode, "create");
  assert.deepEqual(result.generationPackage.references, []);
  assert.equal(result.generationPackage.output.relativePath, "assets/items/fire_sword.png");
  assert.match(result.prompt, /Create a game-ready item image asset\./);
  assert.match(result.prompt, /Request: 炎属性の剣アイコン。RPGの装備画面用/);
  assert.match(result.prompt, /1024x1024 PNG/);
  assert.match(result.prompt, /transparent background/);
  assert.match(result.prompt, /Project visual canon: rpg-items\./);
  assert.match(result.prompt, /Clear silhouette; Readable at small sizes/);
  assert.match(result.prompt, /Avoid: Text; UI frame\./);
});

test("builds a useful no-reference prompt when no Visual Canon context exists", () => {
  const result = createNewAssetPrompt({
    assetKind: "environment",
    userRequest: "A misty forest background for an exploration scene",
    output: {
      relativePath: "assets/backgrounds/misty_forest.webp",
      width: 1536,
      height: 1024,
      format: "webp",
      alpha: "forbid",
    },
  }, { availableAssetPaths: [] });

  assert.deepEqual(result.generationPackage.references, []);
  assert.equal(result.generationPackage.context, undefined);
  assert.match(result.prompt, /misty forest background/);
  assert.match(result.prompt, /1536x1024 WEBP/);
  assert.match(result.prompt, /Do not use transparency/);
  assert.doesNotMatch(result.prompt, /Project visual canon/);
});

test("rejects an existing output path before producing a prompt", () => {
  assert.throws(() => createNewAssetPrompt({
    assetKind: "ui",
    userRequest: "A compact inventory tab icon",
    output: {
      relativePath: "assets/ui/inventory.png",
      width: 512,
      height: 512,
      format: "png",
      alpha: "allow",
    },
  }, { availableAssetPaths: ["assets/ui/inventory.png"] }), (error: unknown) => {
    assert.ok(error instanceof GenerationPackageValidationError);
    assert.ok(error.issues.some((issue) => issue.field === "output.writeMode"));
    return true;
  });
});

test("rejects unsafe or format-mismatched output paths", () => {
  assert.throws(() => createNewAssetPrompt({
    assetKind: "effect",
    userRequest: "A blue magic burst",
    output: {
      relativePath: "../outside/magic.png",
      width: 512,
      height: 512,
      format: "webp",
      alpha: "require",
    },
  }, { availableAssetPaths: [] }), GenerationPackageValidationError);
});

test("prompt builder rejects non-new-asset packages", () => {
  assert.throws(() => buildNewAssetPrompt({
    schemaVersion: 1,
    assetKind: "character",
    intent: "variant",
    userRequest: "Different pose",
    references: [],
    output: {
      relativePath: "assets/characters/hero-pose.png",
      width: 1024,
      height: 1024,
      format: "png",
      alpha: "allow",
      writeMode: "create",
    },
  }), /new-asset Generation Package/);
});
