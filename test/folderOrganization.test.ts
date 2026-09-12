import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, options: { assetType?: string; character?: string } = {}): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: { absolutePath: `/game/${relativePath}`, relativePath, fileName, fileType: "png" },
    ...options,
  };
}

test("detects a character scattered across folders and suggests a character/type target", () => {
  const report = analyzeFolderOrganization([
    asset("assets/portraits/alice.png", { assetType: "Portrait", character: "Alice" }),
    asset("assets/ui/alice-icon.png", { assetType: "Portrait", character: "Alice" }),
  ]);
  const finding = report.findings.find((item) => item.kind === "scattered-character");
  assert.ok(finding);
  assert.deepEqual(finding.affectedFolders, ["assets/portraits", "assets/ui"]);
  assert.equal(finding.suggestedTargetFolder, "assets/characters/alice/portrait");
});

test("detects significant Asset Type mixing only at the bounded threshold", () => {
  const report = analyzeFolderOrganization([
    asset("assets/misc/a.png", { assetType: "Character" }),
    asset("assets/misc/b.png", { assetType: "Character" }),
    asset("assets/misc/c.png", { assetType: "Background" }),
    asset("assets/misc/d.png", { assetType: "Background" }),
  ]);
  assert.ok(report.findings.some((item) => item.kind === "mixed-asset-types"));

  const below = analyzeFolderOrganization([
    asset("assets/misc/a.png", { assetType: "Character" }),
    asset("assets/misc/b.png", { assetType: "Character" }),
    asset("assets/misc/c.png", { assetType: "Background" }),
  ]);
  assert.ok(!below.findings.some((item) => item.kind === "mixed-asset-types"));
});

test("flags conservative deep nesting and one-off leaf folders", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice/poses/combat/attack.png"),
    asset("assets/characters/alice/poses/idle/idle.png"),
  ]);
  assert.ok(report.findings.some((item) => item.kind === "deep-nesting"));
  assert.ok(report.findings.some((item) => item.kind === "one-off-folder"));
});

test("reports Uncategorized concentration as metadata hygiene without inventing semantic metadata", () => {
  const report = analyzeFolderOrganization([
    asset("assets/misc/a.png"),
    asset("assets/misc/b.png"),
    asset("assets/misc/c.png"),
    asset("assets/misc/d.png"),
  ]);
  assert.ok(!report.findings.some((item) => item.kind === "uncategorized-assets" as never));
  const finding = report.metadataFindings.find((item) => item.kind === "uncategorized-assets");
  assert.ok(finding);
  assert.match(finding.reason, /metadata hygiene finding, not a recommendation to move files/i);
  assert.match(finding.reason, /no semantic type is inferred/i);
});

test("returns no findings for a small well-organized set", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice.png", { assetType: "Character", character: "Alice" }),
    asset("assets/backgrounds/forest.png", { assetType: "Background" }),
  ]);
  assert.equal(report.analyzedAssets, 2);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.metadataFindings, []);
});


test("does not flag peer namespace folders solely because each has one asset", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice/portrait.png"),
    asset("assets/characters/bob/portrait.png"),
    asset("assets/characters/carol/portrait.png"),
  ]);
  assert.ok(!report.findings.some((item) => item.kind === "one-off-folder"));
});

test("still flags a suspicious one-off leaf when the peer structure is not a namespace cluster", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice/poses/combat/attack.png"),
    asset("assets/characters/alice/poses/idle/idle.png"),
  ]);
  assert.ok(report.findings.some((item) => item.kind === "one-off-folder"));
});

test("ignores version-like segments when deciding whether nesting is excessive", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice/v2/portrait.png"),
  ]);
  assert.ok(!report.findings.some((item) => item.kind === "deep-nesting"));
});

test("still detects genuinely deep structure when a version-like layer is present", () => {
  const report = analyzeFolderOrganization([
    asset("assets/characters/alice/poses/combat/v2/attack.png"),
  ]);
  assert.ok(report.findings.some((item) => item.kind === "deep-nesting"));
});
