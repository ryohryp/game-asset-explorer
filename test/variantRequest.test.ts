import assert from "node:assert/strict";
import test from "node:test";
import { buildVariantGenerationPackage, getDefaultVariantOutputPath, getVariantOutputSizes, getVariantPresetRequest } from "../src/variantRequest";
import { type WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath = "assets/enemies/slime.png", fileType: WorkspaceAsset["asset"]["fileType"] = "png"): WorkspaceAsset {
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: {
      absolutePath: `/game/${relativePath}`,
      relativePath,
      fileName: relativePath.split("/").at(-1) ?? relativePath,
      fileType,
    },
  };
}

test("preset requests are non-empty and custom requires text", () => {
  for (const preset of ["pose-action", "damage-state", "environment"] as const) {
    assert.ok(getVariantPresetRequest(preset).length > 20);
  }
  assert.equal(getVariantPresetRequest("custom", "  make it icy  "), "make it icy");
  assert.throws(() => getVariantPresetRequest("custom", "   "), /custom variant request/i);
});

test("builds create-only variant package with selected asset as required source anchor", () => {
  const selected = asset();
  const result = buildVariantGenerationPackage(selected, { preset: "pose-action" });

  assert.equal(result.intent, "variant");
  assert.equal(result.output.writeMode, "create");
  assert.equal(result.output.relativePath, "assets/enemies/slime_variant.png");
  assert.equal(result.output.width, 1024);
  assert.equal(result.output.height, 1024);
  assert.equal(result.output.alpha, "preserve");
  assert.deepEqual(result.references, [{
    relativePath: "assets/enemies/slime.png",
    role: "source",
    required: true,
  }]);
});

test("default output path is deterministic and gif sources fall back to png", () => {
  assert.equal(getDefaultVariantOutputPath(asset("icon.webp", "webp")), "icon_variant.webp");
  assert.equal(getDefaultVariantOutputPath(asset("assets/fx/spark.gif", "gif")), "assets/fx/spark_variant.png");
});

test("supports only the bounded provider-compatible size presets", () => {
  assert.deepEqual(getVariantOutputSizes(), ["1024x1024", "1536x1024", "1024x1536"]);
  const result = buildVariantGenerationPackage(asset(), {
    preset: "environment",
    outputSize: "1536x1024",
    outputFormat: "webp",
    outputPath: "assets/enemies/slime_storm.webp",
  });
  assert.equal(result.output.width, 1536);
  assert.equal(result.output.height, 1024);
  assert.equal(result.output.format, "webp");
});

test("rejects output extension and format mismatch before provider invocation", () => {
  assert.throws(() => buildVariantGenerationPackage(asset(), {
    preset: "damage-state",
    outputFormat: "webp",
    outputPath: "assets/enemies/slime_damage.png",
  }), /extension must match/i);
});
