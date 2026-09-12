import assert from "node:assert/strict";
import test from "node:test";
import { selectUncategorizedAssetsInFolder } from "../src/core/bulkAssetTypeAssignment";
import type { WorkspaceAsset } from "../src/workspaceAsset";

function asset(workspace: string, relativePath: string, assetType?: string): WorkspaceAsset {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return { workspaceFolderUri: workspace, workspaceFolderName: workspace, asset: { absolutePath: `/tmp/${relativePath}`, relativePath, fileName, fileType: "png" }, ...(assetType ? { assetType } : {}) };
}

test("selects only Uncategorized assets in the exact folder and workspace", () => {
  const assets = [
    asset("file:///game", "public/images/backgrounds/a.png"),
    asset("file:///game", "public/images/backgrounds/b.png", "Background"),
    asset("file:///game", "public/images/backgrounds/sub/c.png"),
    asset("file:///other", "public/images/backgrounds/d.png"),
  ];
  assert.deepEqual(selectUncategorizedAssetsInFolder(assets, "file:///game", "public/images/backgrounds").map((item) => item.asset.relativePath), ["public/images/backgrounds/a.png"]);
});
