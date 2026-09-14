import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASSET_GRID_LOCALIZATION_MESSAGES,
  createAssetGridUiStrings,
  localizeAssetTypeLabel,
  localizeCharacterLabel,
  localizeProfileLabel,
} from "../src/ui/localization";

test("builds localized UI labels without changing unknown project values", () => {
  const strings = createAssetGridUiStrings((message) => `ja:${message}`);

  assert.equal(strings.refresh, "ja:Refresh");
  assert.equal(localizeAssetTypeLabel("Character", strings), "ja:Character");
  assert.equal(localizeAssetTypeLabel("Project Specific Type", strings), "Project Specific Type");
  assert.equal(localizeCharacterLabel("Unassigned", strings), "ja:Unassigned");
  assert.equal(localizeCharacterLabel("Alice", strings), "Alice");
  assert.equal(localizeProfileLabel("Visual Novel", strings), "ja:Visual Novel");
  assert.equal(localizeProfileLabel("Project Profile", strings), "Project Profile");
});

test("Japanese package catalog covers every English contribution key", () => {
  const english = readJson("package.nls.json");
  const japanese = readJson("package.nls.ja.json");

  assert.deepEqual(Object.keys(japanese).sort(), Object.keys(english).sort());
  assert.equal(japanese["gameAssetExplorer.view.assets"], "アセット");
  assert.equal(japanese["gameAssetExplorer.command.openAssetGrid"], "Game Asset Explorer: アセットグリッドを開く");
});

test("Japanese runtime bundle covers the Asset Grid localization contract", () => {
  const japanese = readJson("l10n/bundle.l10n.ja.json");

  for (const message of Object.values(ASSET_GRID_LOCALIZATION_MESSAGES)) {
    assert.equal(typeof japanese[message], "string", `missing Japanese translation for ${message}`);
    assert.ok(japanese[message].length > 0, `empty Japanese translation for ${message}`);
  }
});

function readJson(relativePath: string): Record<string, string> {
  return JSON.parse(readFileSync(relativePath, "utf8")) as Record<string, string>;
}
