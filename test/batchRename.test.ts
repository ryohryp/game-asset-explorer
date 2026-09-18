import * as assert from "node:assert/strict";
import { test } from "node:test";
import { planBatchRename } from "../src/core/batchRename";

test("plans prefix, replacement, numbering and case without changing extensions", () => {
  const plan = planBatchRename([
    { relativePath: "assets/Hero_Idle.PNG", fileName: "Hero_Idle.PNG" },
    { relativePath: "assets/Hero_Run.PNG", fileName: "Hero_Run.PNG" },
  ], { prefix: "char_", replace: { from: "Hero_", to: "" }, numbering: { start: 1, pad: 2 }, case: "lower" });
  assert.deepEqual(plan.items.map((item) => item.targetRelativePath), ["assets/char_idle01.PNG", "assets/char_run02.PNG"]);
  assert.deepEqual(plan.collisions, []);
});

test("detects case-insensitive target collisions", () => {
  const plan = planBatchRename([
    { relativePath: "a/Foo.png", fileName: "Foo.png" },
    { relativePath: "a/foo.png", fileName: "foo.png" },
  ], { case: "lower" });
  assert.deepEqual(plan.collisions, ["a/foo.png"]);
});
