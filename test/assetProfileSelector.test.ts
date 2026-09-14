import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetProfile } from "../src/core/assetProfiles";
import {
  injectAssetProfileSelector,
  parseSetAssetProfileMessage,
} from "../src/ui/assetProfileSelector";

const profileLabels = {
  Generic: "汎用",
  RPG: "RPG",
  Action: "アクション",
  "Visual Novel": "ビジュアルノベル",
  "Card Game": "カードゲーム",
  Custom: "カスタム",
};

test("replaces the passive profile badge with a localized selectable profile control", () => {
  const html = `
    <div class="facets"><span class="profile-status">Profile: RPG</span></div>
    <script nonce="abc">const vscode = acquireVsCodeApi();</script>
  `;

  const rendered = injectAssetProfileSelector(html, resolveAssetProfile("rpg"), {
    label: "ジャンル / プロファイル",
    profileLabels,
  });

  assert.match(rendered, /id="asset-profile-select"/);
  assert.match(rendered, /ジャンル \/ プロファイル/);
  assert.match(rendered, /<option value="rpg" selected>RPG<\/option>/);
  assert.match(rendered, /<option value="action">アクション<\/option>/);
  assert.match(rendered, /type: 'setAssetProfile'/);
  assert.doesNotMatch(rendered, /<span class="profile-status">/);
});

test("leaves HTML unchanged when the profile badge is not present", () => {
  const html = "<div>No profile marker</div>";
  assert.equal(
    injectAssetProfileSelector(html, resolveAssetProfile("generic"), {
      label: "Genre / Profile",
      profileLabels: {},
    }),
    html,
  );
});

test("accepts only bounded setAssetProfile messages", () => {
  assert.equal(parseSetAssetProfileMessage({ type: "setAssetProfile", profileId: "visual-novel" }), "visual-novel");
  assert.equal(parseSetAssetProfileMessage({ type: "setAssetProfile", profileId: "unknown" }), undefined);
  assert.equal(parseSetAssetProfileMessage({ type: "filter", profileId: "rpg" }), undefined);
  assert.equal(parseSetAssetProfileMessage(null), undefined);
});
