import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizeAssetGridHtml } from "../src/ui/assetGridHtmlLocalization";
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

test("localizes Asset Grid presentation while preserving internal values", () => {
  const translations: Record<string, string> = {
    "Refresh": "更新",
    "Asset Type": "アセット種類",
    "Profile": "プロファイル",
    "Generic": "汎用",
    "Character": "キャラクター",
    "Unassigned": "未割り当て",
    "Uncategorized": "未分類",
    "Preview unavailable": "プレビューできません",
  };
  const strings = createAssetGridUiStrings((message) => translations[message] ?? message);
  const html = `<!DOCTYPE html>
<html lang="en">
<body>
<button id="refresh" type="button">Refresh</button>
<span class="profile-status">Profile: Generic</span>
<label class="facet-label">Asset Type<select id="asset-type-filter"><option value="Character">Character (1)</option></select></label>
<article data-character="Unassigned">
  <div class="asset-type">Character</div>
  <div class="character-name">Character: Unassigned</div>
  <div class="broken">Preview unavailable</div>
</article>
<script>
const vscode = acquireVsCodeApi();
const assetProfile = {"label":"Generic","assetTypes":["Character"]};
option.textContent = assetType;
</script>
</body>
</html>`;

  const localized = localizeAssetGridHtml(html, strings, "ja");

  assert.match(localized, /<html lang="ja">/);
  assert.match(localized, />更新<\/button>/);
  assert.match(localized, /プロファイル: 汎用/);
  assert.match(localized, /<option value="Character">キャラクター \(1\)<\/option>/);
  assert.match(localized, /data-character="Unassigned"/);
  assert.match(localized, /<div class="asset-type">キャラクター<\/div>/);
  assert.match(localized, /<div class="character-name">キャラクター: 未割り当て<\/div>/);
  assert.match(localized, /"assetTypes":\["Character"\]/);
  assert.match(localized, /option\.textContent = localizeAssetType\(assetType\);/);
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

test("Japanese catalogs cover category schema contribution and runtime UI", () => {
  const packageJa = readJson("package.nls.ja.json");
  const runtimeJa = readJson("l10n/bundle.l10n.ja.json");

  assert.equal(
    packageJa["gameAssetExplorer.command.showCategorySummary"],
    "Game Asset Explorer: アセットカテゴリを表示",
  );
  assert.equal(
    packageJa["gameAssetExplorer.command.setAssetSubtype"],
    "Game Asset Explorer: 選択アセットのサブタイプを設定",
  );
  assert.equal(runtimeJa["Subtype unset"], "サブタイプ未設定");
  assert.equal(runtimeJa["Set subtype to {0}."], "サブタイプを {0} に設定しました。");
});
