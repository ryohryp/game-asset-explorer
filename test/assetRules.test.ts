import assert from "node:assert/strict";
import test from "node:test";
import { parseAssetRules, resolveAssetProblemLimits } from "../src/core/assetRules";

test("parses minimal path rules and applies matching limits", () => {
  const config = parseAssetRules(JSON.stringify({ rules: [
    { path: "ui/**", maxWidth: 1024, maxHeight: 512, maxSizeBytes: 1000 },
  ] }));
  assert.deepEqual(resolveAssetProblemLimits("ui/icons/play.png", config), {
    maxWidth: 1024,
    maxHeight: 512,
    maxSizeBytes: 1000,
  });
});

test("keeps defaults for unmatched assets and supports single-segment glob", () => {
  const config = parseAssetRules(JSON.stringify({ rules: [{ path: "characters/*.png", maxWidth: 2048 }] }));
  assert.equal(resolveAssetProblemLimits("characters/hero.png", config).maxWidth, 2048);
  assert.equal(resolveAssetProblemLimits("characters/boss/hero.png", config).maxWidth, 4096);
  assert.equal(resolveAssetProblemLimits("ui/icon.png", config).maxWidth, 4096);
});

test("rejects invalid rule limits", () => {
  assert.throws(() => parseAssetRules('{"rules":[{"path":"ui/**","maxWidth":0}]}'), /positive integer/);
});
