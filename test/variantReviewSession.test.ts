import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationPackage } from "../src/core/generationPackage";
import type { ImageGenerationProvider } from "../src/core/imageGenerationProvider";
import { startVariantReviewSession, type VariantAssetWriter } from "../src/core/variantReviewSession";

const available = ["assets/hero.png"];

function packageForVariant(referencePath = "assets/hero.png") {
  return createGenerationPackage({
    assetKind: "character",
    intent: "variant",
    userRequest: "Create a damaged combat variant",
    references: [{ relativePath: referencePath, role: "source", required: true }],
    output: {
      relativePath: "assets/hero_damaged.png",
      width: 64,
      height: 64,
      format: "png",
      alpha: "preserve",
      writeMode: "create",
    },
  });
}

function providerWith(count: number, onGenerate?: () => void): ImageGenerationProvider {
  return {
    id: "fake",
    async generate() {
      onGenerate?.();
      return {
        model: "fake-model",
        candidates: Array.from({ length: count }, (_, index) => ({
          id: `candidate-${index + 1}`,
          mediaType: "image/png",
          bytes: Uint8Array.from([index + 1, 42]),
          width: 64,
          height: 64,
        })),
      };
    },
  };
}

function recordingWriter() {
  const writes: Array<{ path: string; bytes: number[] }> = [];
  const writer: VariantAssetWriter = {
    async write(path, bytes) {
      writes.push({ path, bytes: Array.from(bytes) });
    },
  };
  return { writer, writes };
}

test("starts a bounded review session from an Approved Anchor", async () => {
  const session = await startVariantReviewSession(providerWith(3), packageForVariant(), { availableAssetPaths: available });
  assert.equal(session.status, "reviewing");
  assert.equal(session.candidates.length, 3);
  assert.deepEqual(session.candidates.map((candidate) => candidate.id), ["candidate-1", "candidate-2", "candidate-3"]);
});

test("exposes a copied transient preview while reviewing", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  const preview = session.getCandidatePreview("candidate-1");
  assert.equal(preview.id, "candidate-1");
  assert.equal(preview.mediaType, "image/png");
  assert.deepEqual(Array.from(preview.bytes), [1, 42]);

  preview.bytes[0] = 99;
  assert.deepEqual(Array.from(session.getCandidatePreview("candidate-1").bytes), [1, 42]);
});

test("preview access rejects an unknown candidate", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  assert.throws(() => session.getCandidatePreview("missing"), /Unknown generation candidate/);
});

test("preview access is unavailable after rejection", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  session.reject();
  assert.throws(() => session.getCandidatePreview("candidate-1"), /already rejected/);
});

test("preview access is unavailable after approval", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  const { writer } = recordingWriter();
  await session.approve("candidate-1", { currentAssetPaths: available, writer });
  assert.throws(() => session.getCandidatePreview("candidate-1"), /already approved/);
});

test("missing Approved Anchor fails before provider invocation", async () => {
  let called = false;
  await assert.rejects(
    startVariantReviewSession(providerWith(2, () => { called = true; }), packageForVariant("assets/missing.png"), { availableAssetPaths: available }),
    /Required reference asset does not exist/,
  );
  assert.equal(called, false);
});

test("requires a required source reference before provider invocation", async () => {
  let called = false;
  const generationPackage = createGenerationPackage({
    ...packageForVariant(),
    references: [{ relativePath: "assets/hero.png", role: "style", required: true }],
  });
  await assert.rejects(
    startVariantReviewSession(providerWith(2, () => { called = true; }), generationPackage, { availableAssetPaths: available }),
    /Approved Anchor/,
  );
  assert.equal(called, false);
});

for (const count of [0, 1, 5]) {
  test(`fails closed when provider returns ${count} candidates`, async () => {
    await assert.rejects(
      startVariantReviewSession(providerWith(count), packageForVariant(), { availableAssetPaths: available }),
      /between 2 and 4 candidates/,
    );
  });
}

test("rejecting a session writes nothing", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  const { writes } = recordingWriter();
  session.reject();
  assert.equal(session.status, "rejected");
  assert.deepEqual(writes, []);
});

test("approval writes only the explicitly selected candidate", async () => {
  const session = await startVariantReviewSession(providerWith(3), packageForVariant(), { availableAssetPaths: available });
  const { writer, writes } = recordingWriter();
  await session.approve("candidate-2", { currentAssetPaths: available, writer });
  assert.equal(session.status, "approved");
  assert.deepEqual(writes, [{ path: "assets/hero_damaged.png", bytes: [2, 42] }]);
});

test("approval re-checks target collision", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  const { writer, writes } = recordingWriter();
  await assert.rejects(
    session.approve("candidate-1", { currentAssetPaths: [...available, "assets/hero_damaged.png"], writer }),
    /refusing to overwrite/,
  );
  assert.equal(session.status, "reviewing");
  assert.deepEqual(writes, []);
});

test("a second approval is rejected", async () => {
  const session = await startVariantReviewSession(providerWith(2), packageForVariant(), { availableAssetPaths: available });
  const { writer } = recordingWriter();
  await session.approve("candidate-1", { currentAssetPaths: available, writer });
  await assert.rejects(
    session.approve("candidate-2", { currentAssetPaths: available, writer }),
    /already approved/,
  );
});
