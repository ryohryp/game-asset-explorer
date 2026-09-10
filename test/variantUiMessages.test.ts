import assert from "node:assert/strict";
import test from "node:test";
import {
  isRejectVariantMessage,
  parseApproveVariantMessage,
  parseStartVariantMessage,
} from "../src/variantUiMessages";

test("accepts bounded Generate Variant input from the Webview", () => {
  assert.deepEqual(parseStartVariantMessage({
    type: "startVariant",
    identity: "workspace::assets/hero.png",
    input: {
      preset: "damage-state",
      customRequest: "more scratches",
      outputPath: "assets/hero_damaged.png",
      outputSize: "1024x1024",
      outputFormat: "png",
    },
  }), {
    type: "startVariant",
    identity: "workspace::assets/hero.png",
    input: {
      preset: "damage-state",
      customRequest: "more scratches",
      outputPath: "assets/hero_damaged.png",
      outputSize: "1024x1024",
      outputFormat: "png",
    },
  });
});

test("rejects unbounded or malformed Generate Variant input", () => {
  assert.equal(parseStartVariantMessage({
    type: "startVariant",
    identity: "asset",
    input: { preset: "invent-mode" },
  }), undefined);
  assert.equal(parseStartVariantMessage({
    type: "startVariant",
    identity: "asset",
    input: { preset: "custom", outputSize: "8192x8192" },
  }), undefined);
  assert.equal(parseStartVariantMessage({
    type: "startVariant",
    identity: "asset",
    input: { preset: "custom", outputFormat: "svg" },
  }), undefined);
});

test("accepts explicit approve and reject actions only", () => {
  assert.deepEqual(parseApproveVariantMessage({ type: "approveVariant", candidateId: "candidate-2" }), {
    type: "approveVariant",
    candidateId: "candidate-2",
  });
  assert.equal(parseApproveVariantMessage({ type: "approveVariant", candidateId: "" }), undefined);
  assert.equal(isRejectVariantMessage({ type: "rejectVariant" }), true);
  assert.equal(isRejectVariantMessage({ type: "cancelSomethingElse" }), false);
});
