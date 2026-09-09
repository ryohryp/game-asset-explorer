import assert from "node:assert/strict";
import test from "node:test";
import { findAssetUsageMatches, getAssetUsageCandidates } from "../src/core/assetUsages";

test("generates normalized path variants and filename fallback", () => {
  assert.deepEqual(
    getAssetUsageCandidates({ relativePath: "assets\\ui\\button.png", fileName: "button.png" }),
    ["assets/ui/button.png", "./assets/ui/button.png", "/assets/ui/button.png", "button.png"],
  );
});

test("does not duplicate candidates", () => {
  assert.deepEqual(
    getAssetUsageCandidates({ relativePath: "button.png", fileName: "button.png" }),
    ["button.png", "./button.png", "/button.png"],
  );
});

test("finds direct and repeated usages", () => {
  const text = 'const first = "assets/ui/button.png";\nconst second = "/assets/ui/button.png";';
  const matches = findAssetUsageMatches(text, ["assets/ui/button.png", "/assets/ui/button.png", "button.png"]);

  assert.equal(matches.length, 2);
  assert.equal(matches[0].candidate, "assets/ui/button.png");
  assert.equal(matches[1].candidate, "/assets/ui/button.png");
});

test("does not report unrelated text", () => {
  assert.deepEqual(findAssetUsageMatches("const value = 'other.png';", ["button.png"]), []);
});

test("deduplicates overlapping filename fallback inside a path match", () => {
  const matches = findAssetUsageMatches("assets/ui/button.png", ["assets/ui/button.png", "button.png"]);

  assert.deepEqual(matches, [{
    candidate: "assets/ui/button.png",
    startOffset: 0,
    endOffset: "assets/ui/button.png".length,
  }]);
});
