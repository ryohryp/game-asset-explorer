import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import { buildOrganizationPrompt, ORGANIZATION_PROMPT_ASSET_LIMIT } from "../src/core/organizationPrompt";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, options: { assetType?: string; character?: string; workspace?: string } = {}): WorkspaceAsset {
  const workspace = options.workspace ?? "Game";
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: `file:///${workspace}`,
    workspaceFolderName: workspace,
    asset: { absolutePath: `/tmp/${relativePath}`, relativePath, fileName, fileType: "png" },
    ...(options.assetType ? { assetType: options.assetType } : {}),
    ...(options.character ? { character: options.character } : {}),
  };
}

test("builds deterministic organization prompt from findings and explicit metadata", () => {
  const assets = [
    asset("assets/ui/alice.png", { assetType: "Icon", character: "Alice" }),
    asset("assets/portraits/alice.png", { assetType: "Icon", character: "Alice" }),
    asset("assets/misc/unknown.png"),
  ];
  const report = analyzeFolderOrganization(assets);
  const activeAssetTypes = ["Character", "Icon", "Background"];
  const first = buildOrganizationPrompt(report, assets, activeAssetTypes);
  const second = buildOrganizationPrompt(report, [...assets].reverse(), activeAssetTypes);
  assert.equal(first, second);
  assert.match(first, /Folder\/path names are review evidence only/);
  assert.match(first, /unless it appears in the Active Asset Profile/);
  assert.match(first, /Do not infer a Character assignment solely from a folder name/);
  assert.match(first, /metadata improvements are suggestions that require explicit user review/i);
  assert.match(first, /Do not invent global folder-to-type mapping rules/);
  assert.match(first, /Active Asset Profile types: Character, Icon, Background/);
  assert.match(first, /Confidence: high \/ medium \/ low/);
  assert.match(first, /recommended move count to be zero/);
  assert.match(first, /Prefer metadata correction over filesystem changes/);
  assert.ok(first.indexOf("No-change recommendations") < first.indexOf("Metadata improvements"));
  assert.ok(first.indexOf("Metadata improvements") < first.indexOf("Recommended moves"));
  assert.ok(first.indexOf("Recommended moves") < first.indexOf("Rejected move ideas"));
  assert.ok(first.indexOf("Rejected move ideas") < first.indexOf("Tool false positives \/ analyzer improvements"));
  assert.match(first, /Character=Alice/);
  assert.match(first, /Type=Uncategorized/);
});

test("bounds the asset summary", () => {
  const assets = Array.from({ length: ORGANIZATION_PROMPT_ASSET_LIMIT + 7 }, (_, index) => asset(`assets/icon-${String(index).padStart(3, "0")}.png`));
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);
  assert.match(prompt, /7 additional assets omitted/);
  assert.doesNotMatch(prompt, /icon-206\.png/);
});

test("handles a no-finding report without inventing advice", () => {
  const assets = [asset("assets/characters/alice.png", { assetType: "Character", character: "Alice" })];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);
  assert.match(prompt, /No organization findings were detected/);
  assert.match(prompt, /No-change recommendations/);
});


test("does not permit concrete Asset Type recommendations when no active profile is supplied", () => {
  const assets = [asset("assets/characters/alice.png")];
  const prompt = buildOrganizationPrompt(analyzeFolderOrganization(assets), assets);
  assert.match(prompt, /Active Asset Profile types: \(none supplied; do not recommend concrete Asset Types\)/);
  assert.match(prompt, /No project folder-to-type conventions are supplied/);
});
