import assert from "node:assert/strict";
import test from "node:test";
import { extractDirectImageReferences, findMissingDirectReferences } from "../src/core/assetHealth";

test("reports only deterministic missing image references", () => {
  const text = `const missing = "assets/missing.png"; const existing = "assets/hero.png"; const dynamic = ` + "`assets/${name}.png`" + `; const external = "https://example.com/image.png";`;
  const missing = findMissingDirectReferences(extractDirectImageReferences(text), ["assets/hero.png"]);
  assert.deepEqual(missing.map((item) => item.normalizedPath), ["assets/missing.png"]);
});
