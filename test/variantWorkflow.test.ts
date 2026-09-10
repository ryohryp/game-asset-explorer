import assert from "node:assert/strict";
import test from "node:test";
import type { ImageGenerationProvider } from "../src/core/imageGenerationProvider";
import { startVariantReviewSession } from "../src/core/variantReviewSession";
import { VariantReviewController } from "../src/variantReviewController";
import { VariantWorkflow } from "../src/variantWorkflow";
import type { WorkspaceAsset } from "../src/workspaceAsset";

const asset: WorkspaceAsset = {
  workspaceFolderUri: "file:///game",
  workspaceFolderName: "game",
  asset: { absolutePath: "/game/assets/hero.png", relativePath: "assets/hero.png", fileName: "hero.png", fileType: "png" },
};

const provider: ImageGenerationProvider = {
  id: "fake",
  async generate() {
    return { model: "fake", candidates: [1, 2].map((id) => ({ id: `c${id}`, mediaType: "image/png", bytes: Uint8Array.from([id]) })) };
  },
};

function workflow(starter = async (_asset: WorkspaceAsset, generationPackage: Parameters<typeof startVariantReviewSession>[1]) => (
  startVariantReviewSession(provider, generationPackage, { availableAssetPaths: ["assets/hero.png"] })
)) {
  return new VariantWorkflow(new VariantReviewController(async () => {}), starter);
}

test("composes request building, session start, and review presentation", async () => {
  let sourcePath = "";
  const review = await workflow(async (_asset, generationPackage) => {
    sourcePath = generationPackage.references[0].relativePath;
    return startVariantReviewSession(provider, generationPackage, { availableAssetPaths: ["assets/hero.png"] });
  }).start(asset, { preset: "damage-state" });

  assert.equal(sourcePath, "assets/hero.png");
  assert.equal(review.outputPath, "assets/hero_variant.png");
  assert.equal(review.candidates.length, 2);
});

test("builder validation fails before starting a provider session", async () => {
  let starts = 0;
  const subject = workflow(async (_asset, generationPackage) => {
    starts += 1;
    return startVariantReviewSession(provider, generationPackage, { availableAssetPaths: ["assets/hero.png"] });
  });
  await assert.rejects(subject.start(asset, { preset: "custom", customRequest: "" }), /custom variant request/);
  assert.equal(starts, 0);
});

test("starter failure does not leave a phantom active review", async () => {
  const subject = workflow(async () => { throw new Error("provider unavailable"); });
  await assert.rejects(subject.start(asset, { preset: "pose-action" }), /provider unavailable/);
  const review = await workflow().start(asset, { preset: "pose-action" });
  assert.equal(review.candidates.length, 2);
});

test("rejects a second start while review is active without invoking starter", async () => {
  const controller = new VariantReviewController(async () => {});
  let starts = 0;
  const subject = new VariantWorkflow(controller, async (_asset, generationPackage) => {
    starts += 1;
    return startVariantReviewSession(provider, generationPackage, { availableAssetPaths: ["assets/hero.png"] });
  });
  await subject.start(asset, { preset: "pose-action" });
  await assert.rejects(subject.start(asset, { preset: "damage-state" }), /already active/);
  assert.equal(starts, 1);
});
