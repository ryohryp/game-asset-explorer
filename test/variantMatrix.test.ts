import assert from "node:assert/strict";
import test from "node:test";
import { buildVariantMatrix, parseVariantFileName } from "../src/core/variantMatrix";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(path: string): WorkspaceAsset {
  const fileName = path.split("/").at(-1)!;
  return { workspaceFolderUri: "file:///game", workspaceFolderName: "game", asset: { absolutePath: `/game/${path}`, relativePath: path, fileName, fileType: "png" } };
}

test("parses simple underscore and hyphen variant suffixes", () => {
  assert.deepEqual(parseVariantFileName("knight_idle.png"), { baseName: "knight", variant: "idle" });
  assert.deepEqual(parseVariantFileName("mage-attack.webp"), { baseName: "mage", variant: "attack" });
  assert.equal(parseVariantFileName("background.png"), undefined);
});

test("builds rows only for observable variant series and exposes missing cells", () => {
  const matrix = buildVariantMatrix([asset("knight_idle.png"), asset("knight_attack.png"), asset("mage_idle.png"), asset("logo.png")]);
  assert.deepEqual(matrix.variants, ["attack", "idle"]);
  assert.equal(matrix.rows.length, 1);
  assert.equal(matrix.rows[0].baseName, "knight");
  assert.equal(matrix.rows[0].variants.attack.asset.relativePath, "knight_attack.png");
});
