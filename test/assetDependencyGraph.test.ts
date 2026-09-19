import test from "node:test";
import assert from "node:assert/strict";
import { buildAssetDependencyView } from "../src/core/assetDependencyGraph";

test("groups direct references into a deterministic dependency view", () => {
  const view = buildAssetDependencyView("assets/hero.png", [
    { sourcePath: "src/z.ts", line: 4, character: 2 },
    { sourcePath: "src/a.ts", line: 1, character: 3 },
    { sourcePath: "src/a.ts", line: 8, character: 1 },
  ]);
  assert.equal(view.assetPath, "assets/hero.png");
  assert.deepEqual(view.sources, [
    { sourcePath: "src/a.ts", usageCount: 2, firstLine: 1, firstCharacter: 3 },
    { sourcePath: "src/z.ts", usageCount: 1, firstLine: 4, firstCharacter: 2 },
  ]);
  assert.match(view.caveat, /dynamic references/i);
});

test("keeps an unreferenced asset visible without inventing dependencies", () => {
  const view = buildAssetDependencyView("assets/manual.png", []);
  assert.deepEqual(view.sources, []);
});
