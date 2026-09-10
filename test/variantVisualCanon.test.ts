import assert from "node:assert/strict";
import test from "node:test";
import { parseVisualCanon, resolveVisualCanonEntry } from "../src/core/visualCanon";
import { buildVariantGenerationPackage } from "../src/variantRequest";
import { type WorkspaceAsset } from "../src/workspaceAsset";

const selectedAsset: WorkspaceAsset = {
  workspaceFolderUri: "file:///game",
  workspaceFolderName: "game",
  asset: {
    absolutePath: "/game/assets/goblin_idle.png",
    relativePath: "assets/goblin_idle.png",
    fileName: "goblin_idle.png",
    fileType: "png",
  },
};

test("resolved Visual Canon enriches a variant package without replacing its source anchor", () => {
  const canon = parseVisualCanon(JSON.stringify({
    schemaVersion: 1,
    entries: [{
      id: "goblin",
      kind: "character",
      anchors: ["assets/goblin_idle.png", "assets/goblin_style.png"],
      constraints: ["moss-green palette"],
      forbidden: ["photorealistic"],
    }],
  }));
  const visualCanon = resolveVisualCanonEntry(canon, "goblin", ["assets/goblin_idle.png", "assets/goblin_style.png"]);

  const generationPackage = buildVariantGenerationPackage(selectedAsset, {
    preset: "pose-action",
    visualCanon,
  });

  assert.equal(generationPackage.assetKind, "character");
  assert.deepEqual(generationPackage.references, [
    { relativePath: "assets/goblin_idle.png", role: "source", required: true },
    { relativePath: "assets/goblin_style.png", role: "style", required: true },
  ]);
  assert.deepEqual(generationPackage.context, {
    subjectId: "goblin",
    constraints: ["moss-green palette"],
    forbidden: ["photorealistic"],
  });
});
