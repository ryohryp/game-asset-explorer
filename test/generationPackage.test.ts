import assert from "node:assert/strict";
import test from "node:test";
import {
  createGenerationPackage,
  GenerationPackageValidationError,
  validateGenerationPackage,
  type GenerationPackage,
} from "../src/core/generationPackage";
import {
  invokeImageGeneration,
  type ImageGenerationProvider,
} from "../src/core/imageGenerationProvider";

function validPackage(overrides: Partial<GenerationPackage> = {}): GenerationPackage {
  return {
    schemaVersion: 1,
    assetKind: "character",
    intent: "variant",
    userRequest: "Create a damaged battle variant.",
    references: [{ relativePath: "assets/hero/idle.png", role: "source", required: true }],
    output: {
      relativePath: "assets/hero/idle_damaged.png",
      width: 512,
      height: 512,
      format: "png",
      alpha: "preserve",
      writeMode: "create",
    },
    ...overrides,
  };
}

const validationContext = {
  availableAssetPaths: ["assets/hero/idle.png", "assets/ui/button.png"],
};

test("creates normalized plain-data Generation Packages for character and non-character assets", () => {
  const character = createGenerationPackage({
    assetKind: "character",
    intent: "variant",
    userRequest: "  different pose  ",
    references: [{ relativePath: ".\\assets\\hero\\idle.png", role: "subject", required: true }],
    output: {
      relativePath: ".\\assets\\hero\\pose.png",
      width: 512,
      height: 512,
      format: "png",
      alpha: "require",
      writeMode: "create",
    },
    context: {
      subjectId: " hero ",
      constraints: [" cel shaded ", ""],
      forbidden: ["photorealistic"],
    },
  });
  const environment = createGenerationPackage({
    assetKind: "environment",
    intent: "new-asset",
    userRequest: "Rainy night version",
    output: {
      relativePath: "assets/backgrounds/town_rain.webp",
      width: 1280,
      height: 720,
      format: "webp",
      alpha: "forbid",
      writeMode: "create",
    },
  });

  assert.equal(character.userRequest, "different pose");
  assert.equal(character.references[0].relativePath, "assets/hero/idle.png");
  assert.equal(character.output.relativePath, "assets/hero/pose.png");
  assert.deepEqual(character.context?.constraints, ["cel shaded"]);
  assert.equal(environment.assetKind, "environment");
  assert.deepEqual(JSON.parse(JSON.stringify(environment)), environment);
});

test("rejects output paths outside the workspace and format mismatches", () => {
  const traversal = validPackage({
    output: { ...validPackage().output, relativePath: "../outside.png" },
  });
  const absolute = validPackage({
    output: { ...validPackage().output, relativePath: "/tmp/out.png" },
  });
  const mismatch = validPackage({
    output: { ...validPackage().output, relativePath: "assets/hero/out.webp", format: "png" },
  });

  assert.ok(validateGenerationPackage(traversal, validationContext).some((issue) => issue.field === "output.relativePath"));
  assert.ok(validateGenerationPackage(absolute, validationContext).some((issue) => issue.field === "output.relativePath"));
  assert.ok(validateGenerationPackage(mismatch, validationContext).some((issue) => issue.field === "output.format"));
});

test("rejects missing required references and invalid alpha constraints", () => {
  const missingReference = validPackage({
    references: [{ relativePath: "assets/hero/missing.png", role: "source", required: true }],
  });
  const jpegAlpha = validPackage({
    output: {
      relativePath: "assets/hero/damaged.jpg",
      width: 512,
      height: 512,
      format: "jpg",
      alpha: "require",
      writeMode: "create",
    },
  });

  assert.ok(validateGenerationPackage(missingReference, validationContext).some((issue) => issue.field === "references[0].relativePath"));
  assert.ok(validateGenerationPackage(jpegAlpha, validationContext).some((issue) => issue.field === "output.alpha"));
});

test("fails closed on create collisions and requires explicit edit mode for replacement", () => {
  const collidingCreate = validPackage({
    output: { ...validPackage().output, relativePath: "assets/ui/button.png" },
  });
  const implicitReplace = validPackage({
    output: { ...validPackage().output, relativePath: "assets/ui/button.png", writeMode: "replace" },
  });
  const explicitReplace = validPackage({
    intent: "edit",
    output: { ...validPackage().output, relativePath: "assets/ui/button.png", writeMode: "replace" },
  });

  assert.ok(validateGenerationPackage(collidingCreate, validationContext).some((issue) => issue.field === "output.writeMode"));
  assert.ok(validateGenerationPackage(implicitReplace, validationContext).some((issue) => issue.field === "intent"));
  assert.deepEqual(validateGenerationPackage(explicitReplace, validationContext), []);
});

test("does not call a provider when validation fails", async () => {
  let calls = 0;
  const provider: ImageGenerationProvider = {
    id: "fake",
    async generate() {
      calls += 1;
      return { candidates: [] };
    },
  };
  const invalid = validPackage({
    references: [{ relativePath: "assets/hero/missing.png", role: "source", required: true }],
  });

  await assert.rejects(
    () => invokeImageGeneration(provider, invalid, validationContext),
    GenerationPackageValidationError,
  );
  assert.equal(calls, 0);
});

test("providers are swappable and invocation returns credential-free normalized receipt metadata", async () => {
  const makeProvider = (id: string): ImageGenerationProvider => ({
    id,
    async generate() {
      return {
        model: `${id}-model`,
        candidates: [{
          id: `${id}-candidate`,
          mediaType: "image/png",
          bytes: new Uint8Array([1, 2, 3, 4]),
          width: 512,
          height: 512,
        }],
      };
    },
  });

  const packageValue = validPackage();
  const first = await invokeImageGeneration(makeProvider("provider-a"), packageValue, validationContext);
  const second = await invokeImageGeneration(makeProvider("provider-b"), packageValue, validationContext);

  assert.equal(first.receipt.providerId, "provider-a");
  assert.equal(second.receipt.providerId, "provider-b");
  assert.deepEqual(first.receipt.candidates, [{
    id: "provider-a-candidate",
    mediaType: "image/png",
    byteLength: 4,
    width: 512,
    height: 512,
  }]);
  assert.equal("credentials" in first.receipt, false);
  assert.equal("provider" in packageValue, false);
});
