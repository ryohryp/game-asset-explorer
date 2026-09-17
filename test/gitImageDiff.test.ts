import assert from "node:assert/strict";
import test from "node:test";
import { parseGitImageStatus } from "../src/core/gitImageDiff";

test("parses only changed image files", () => {
  const result = parseGitImageStatus(" M assets/hero.png\nA  assets/new.webp\n D assets/old.jpg\n?? assets/new.gif\n M src/index.ts\n");
  assert.deepEqual(result, [
    { relativePath: "assets/hero.png", kind: "modified" },
    { relativePath: "assets/new.webp", kind: "added" },
    { relativePath: "assets/old.jpg", kind: "deleted" },
    { relativePath: "assets/new.gif", kind: "added" },
  ]);
});

test("normalizes renamed image target paths", () => {
  assert.deepEqual(parseGitImageStatus("R  assets/old.png -> assets/new.png\n"), [
    { relativePath: "assets/new.png", kind: "modified" },
  ]);
});
