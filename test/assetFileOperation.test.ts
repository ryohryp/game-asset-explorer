import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRelativePath, planAssetFileOperation } from "../src/core/assetFileOperation";

test("plans ordinary workspace-relative move and copy operations", () => {
  assert.deepEqual(planAssetFileOperation("move", "assets/a.png", "assets/ui/a.png"), {
    operation: "move",
    sourceRelativePath: "assets/a.png",
    targetRelativePath: "assets/ui/a.png",
  });
  assert.equal(planAssetFileOperation("copy", "assets/a.png", "assets/a-copy.png").operation, "copy");
});

test("rejects paths outside the workspace and no-op targets", () => {
  assert.throws(() => normalizeRelativePath("../outside.png"), /inside the workspace/);
  assert.throws(() => planAssetFileOperation("move", "assets/a.png", "assets/a.png"), /different/);
});
