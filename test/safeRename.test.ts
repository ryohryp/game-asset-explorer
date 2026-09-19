import assert from "node:assert/strict";
import test from "node:test";
import { planImageRename, planReferenceEdits } from "../src/core/safeRename";

const source = "assets/hero.png";
const target = "assets/hero-new.png";

test("rename stays in the same directory and preserves extension", () => {
  assert.equal(planImageRename(source, "hero-new.png"), target);
  for (const name of ["../hero.png", "x/hero.png", "C:\\hero.png", "hero.jpg", "hero.png", "HERO.png", "x\".png", "x$.png", "con.png", " x.png"]) {
    assert.throws(() => planImageRename(source, name), name);
  }
  for (const invalid of ["../hero.png", "/hero.png", "C:/hero.png", "assets/../hero.png"]) {
    assert.throws(() => planImageRename(invalid, "new.png"));
  }
});

test("plans repeated exact static references with preserved prefixes and offsets", () => {
  const text = 'const a = "assets/hero.png";\r\nconst b = \'/assets/hero.png\';\nconst c = "./assets/hero.png";';
  const result = planReferenceEdits(text, source, target, "main.ts");
  assert.deepEqual(result.edits.map((edit) => edit.after), [target, "/" + target, "./" + target]);
  for (const edit of result.edits) assert.equal(text.slice(edit.startOffset, edit.endOffset), edit.before);
  assert.equal(result.skippedMatches, 0);
});

test("leaves ambiguous, dynamic, partial, external and comment matches unchanged", () => {
  const text = [
    '"hero.png"', '"../assets/hero.png"', '"https://example.com/assets/hero.png"',
    '"assets/hero.png?version=1"', '"assets/hero.png.extra"', '"other/assets/hero.png"',
    'prefix + "assets/hero.png"', '"assets/hero.png" + suffix',
    '// "assets/hero.png"', '/* "assets/hero.png" */', '<!-- "assets/hero.png" -->',
    '"${base}/assets/hero.png"', '"./assets/hero.png"',
  ].join("\n");
  const result = planReferenceEdits(text, source, target, "src/main.ts");
  assert.deepEqual(result.edits, []);
  assert.ok(result.skippedMatches > 0);
});

test("does not reinterpret nested template expressions or escaped quotes", () => {
  for (const text of ['`prefix ${x ? "assets/hero.png" : `other`} end`', '"escaped \\"assets/hero.png\\""']) {
    assert.deepEqual(planReferenceEdits(text, source, target, "main.ts").edits, []);
  }
  assert.deepEqual(planReferenceEdits('"hero.png"', "hero.png", "new.png", "main.ts").edits, []);
});
