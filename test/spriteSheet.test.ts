import { strict as assert } from "node:assert";
import test from "node:test";
import { buildSpriteCells } from "../src/core/spriteSheet";

test("builds row-major sprite cells", () => {
  const cells = buildSpriteCells(320, 160, 2, 4);
  assert.equal(cells.length, 8);
  assert.deepEqual(cells[5], { index: 5, row: 1, column: 1, x: 80, y: 80, width: 80, height: 80 });
});

test("rejects invalid grid sizes", () => {
  assert.deepEqual(buildSpriteCells(320, 160, 0, 4), []);
  assert.deepEqual(buildSpriteCells(320, 160, 2, 1.5), []);
});
