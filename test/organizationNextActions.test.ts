import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFolderOrganization } from "../src/core/folderOrganization";
import { deriveOrganizationNextActions } from "../src/core/organizationNextActions";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(relativePath: string, assetType?: string): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    workspaceFolderUri: "file:///game",
    workspaceFolderName: "game",
    asset: { absolutePath: `/game/${relativePath}`, relativePath, fileName, fileType: "png" },
    ...(assetType ? { assetType } : {}),
  };
}

test("surfaces existing bulk Asset Type assignment for a single-folder Uncategorized finding", () => {
  const report = analyzeFolderOrganization([
    asset("public/images/backgrounds/a.png"),
    asset("public/images/backgrounds/b.png"),
    asset("public/images/backgrounds/c.png"),
    asset("public/images/backgrounds/d.png"),
    asset("public/images/backgrounds/typed.png", "Background"),
  ]);

  assert.deepEqual(deriveOrganizationNextActions(report), {
    actionable: [{
      kind: "bulk-assign-asset-type",
      workspaceFolderUri: "file:///game",
      workspaceFolderName: "game",
      folder: "public/images/backgrounds",
      assetCount: 4,
    }],
    humanReviewCount: 0,
    lowConfidenceReviewCount: 0,
  });
});

test("keeps folder organization findings as review-only instead of inventing mutations", () => {
  const report = analyzeFolderOrganization([
    asset("assets/scenes/events/cg.png"),
    asset("assets/scenes/backgrounds/day.png"),
    asset("assets/scenes/backgrounds/night.png"),
  ]);
  const next = deriveOrganizationNextActions(report);

  assert.equal(next.actionable.length, 0);
  assert.ok(next.humanReviewCount > 0);
  assert.ok(next.lowConfidenceReviewCount > 0);
});
