import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationPackage } from "../src/core/generationPackage";
import type { ImageGenerationProvider } from "../src/core/imageGenerationProvider";
import { startVariantReviewSession } from "../src/core/variantReviewSession";
import { VariantReviewController } from "../src/variantReviewController";

const available = ["assets/hero.png"];

function packageForVariant() {
  return createGenerationPackage({
    assetKind: "character",
    intent: "variant",
    userRequest: "Create a damaged combat variant",
    references: [{ relativePath: "assets/hero.png", role: "source", required: true }],
    output: {
      relativePath: "assets/hero_variant.png",
      width: 1024,
      height: 1024,
      format: "png",
      alpha: "preserve",
      writeMode: "create",
    },
  });
}

function providerWithMediaType(mediaType = "image/png"): ImageGenerationProvider {
  return {
    id: "fake",
    async generate() {
      return {
        model: "fake-model",
        candidates: [1, 2].map((value) => ({
          id: `candidate-${value}`,
          mediaType,
          bytes: Uint8Array.from([value, 42]),
          width: 1024,
          height: 1024,
        })),
      };
    },
  };
}

async function session(mediaType = "image/png") {
  return startVariantReviewSession(providerWithMediaType(mediaType), packageForVariant(), { availableAssetPaths: available });
}

test("presents bounded candidates as Webview-ready data URIs", async () => {
  const controller = new VariantReviewController(async () => {});
  const review = controller.begin(await session());

  assert.equal(review.outputPath, "assets/hero_variant.png");
  assert.equal(review.candidates.length, 2);
  assert.deepEqual(review.candidates.map((candidate) => candidate.id), ["candidate-1", "candidate-2"]);
  assert.equal(review.candidates[0].dataUri, "data:image/png;base64,ASo=");
  assert.equal(review.candidates[0].byteLength, 2);
  assert.equal(controller.hasActiveReview, true);
});

test("rejects executable or unsupported preview media types", async () => {
  const controller = new VariantReviewController(async () => {});
  const unsafeSession = await session("image/svg+xml");
  assert.throws(() => controller.begin(unsafeSession), /unsupported or unsafe/);
  assert.equal(controller.hasActiveReview, false);
});

test("approval delegates exactly the selected candidate and clears the review", async () => {
  const calls: string[] = [];
  const controller = new VariantReviewController(async (activeSession, candidateId) => {
    calls.push(candidateId);
    await activeSession.approve(candidateId, {
      currentAssetPaths: available,
      writer: { async write() {} },
    });
  });
  controller.begin(await session());

  await controller.approve("candidate-2");
  assert.deepEqual(calls, ["candidate-2"]);
  assert.equal(controller.hasActiveReview, false);
  await assert.rejects(controller.approve("candidate-1"), /No active/);
});

test("rejection clears transient review state and cannot be repeated", async () => {
  const controller = new VariantReviewController(async () => {});
  const activeSession = await session();
  controller.begin(activeSession);

  controller.reject();
  assert.equal(activeSession.status, "rejected");
  assert.equal(controller.hasActiveReview, false);
  assert.throws(() => controller.reject(), /No active/);
});

test("fails closed for unknown candidate without ending the active review", async () => {
  const controller = new VariantReviewController(async () => {});
  controller.begin(await session());

  await assert.rejects(controller.approve("missing"), /Unknown generation candidate/);
  assert.equal(controller.hasActiveReview, true);
});

test("does not replace an already active review", async () => {
  const controller = new VariantReviewController(async () => {});
  controller.begin(await session());
  const secondSession = await session();
  assert.throws(() => controller.begin(secondSession), /already active/);
});
