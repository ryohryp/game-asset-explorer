import assert from "node:assert/strict";
import test from "node:test";
import { renderContactSheetSvg } from "../src/core/contactSheet";

const items = [
  { fileName: "hero&idle.png", dataUri: "data:image/png;base64,AA==" },
  { fileName: "hero-walk.png", dataUri: "data:image/png;base64,AQ==" },
  { fileName: "hero-attack.png", dataUri: "data:image/png;base64,Ag==" },
];

test("renders selected images into a labeled grid", () => {
  const svg = renderContactSheetSvg(items, { columns: 2, cellSize: 128 });
  assert.match(svg, /width="256" height="312"/);
  assert.match(svg, /hero&amp;idle\.png/);
  assert.equal((svg.match(/<image /g) ?? []).length, 3);
});

test("rejects unsafe layout values and too few images", () => {
  assert.throws(() => renderContactSheetSvg(items.slice(0, 1), { columns: 2, cellSize: 128 }), /at least two/);
  assert.throws(() => renderContactSheetSvg(items, { columns: 0, cellSize: 128 }), /Columns/);
  assert.throws(() => renderContactSheetSvg(items, { columns: 2, cellSize: 32 }), /Cell size/);
});
