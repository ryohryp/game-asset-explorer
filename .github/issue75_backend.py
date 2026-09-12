from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found: {path}")
    p.write_text(text.replace(old, new, 1))

replace_once("src/extension.ts", 'import { loadAssetDetails } from "./core/assetDetails";\n', 'import { loadAssetDetails } from "./core/assetDetails";\nimport { selectUncategorizedAssetsInFolder } from "./core/bulkAssetTypeAssignment";\n')
replace_once("src/extension.ts", '  updateWorkspaceAssetCharacter,\n  updateWorkspaceAssetType,\n', '  updateWorkspaceAssetCharacter,\n  updateWorkspaceAssetType,\n  updateWorkspaceAssetTypes,\n')
replace_once("src/extension.ts", '''      onCopyOrganizationPrompt: async () => {
        const report = analyzeFolderOrganization(discoveredAssets);
        await vscode.env.clipboard.writeText(buildOrganizationPrompt(report, discoveredAssets));
      },
''', '''      onCopyOrganizationPrompt: async () => {
        const report = analyzeFolderOrganization(discoveredAssets);
        await vscode.env.clipboard.writeText(buildOrganizationPrompt(report, discoveredAssets));
      },
      onBulkAssignAssetType: async (workspaceFolderUri, folder, assetType) => {
        activeProfile = getConfiguredAssetProfile();
        const report = analyzeFolderOrganization(discoveredAssets);
        const eligible = report.findings.some((finding) =>
          finding.kind === "uncategorized-concentration"
          && finding.workspaceFolderUri === workspaceFolderUri
          && finding.affectedFolders.length === 1
          && finding.affectedFolders[0] === folder,
        );
        if (!eligible) throw new Error("This folder is no longer eligible for bulk Asset Type assignment. Analyze Organization again.");
        const targets = selectUncategorizedAssetsInFolder(discoveredAssets, workspaceFolderUri, folder);
        if (targets.length === 0) throw new Error("No Uncategorized assets remain in this folder.");
        const updatedCount = await updateWorkspaceAssetTypes(targets, assetType, activeProfile, assetTypeStore);
        const assets = await scanAndStore(false);
        await vscode.window.showInformationMessage(`Game Asset Explorer: Assigned ${updatedCount} asset${updatedCount === 1 ? "" : "s"} in ${folder || "Workspace root"} as ${assetType}.`);
        return assets;
      },
''')

replace_once("test/assetTypeWorkspace.test.ts", '  updateWorkspaceAssetType,\n', '  updateWorkspaceAssetType,\n  updateWorkspaceAssetTypes,\n')
with Path("test/assetTypeWorkspace.test.ts").open("a") as f:
    f.write(r'''

test("bulk type assignment updates only provided Uncategorized assets and preserves other assignments", async () => {
  const store = memoryStore({
    "file:///game": JSON.stringify({ schemaVersion: 1, assignments: { "assets/backgrounds/already.png": "Background", "assets/icons/keep.png": "UI" } }),
  });
  const profile = resolveAssetProfile("generic");
  const first = asset("file:///game", "assets/backgrounds/one.png");
  const second = asset("file:///game", "assets/backgrounds/two.png");
  const alreadyTyped = { ...asset("file:///game", "assets/backgrounds/already.png"), assetType: "Background" };
  const count = await updateWorkspaceAssetTypes([first, second, alreadyTyped], "Background", profile, store);
  assert.equal(count, 2);
  const text = store.values["file:///game"];
  assert.match(text, /"assets\/backgrounds\/one.png": "Background"/);
  assert.match(text, /"assets\/backgrounds\/two.png": "Background"/);
  assert.match(text, /"assets\/backgrounds\/already.png": "Background"/);
  assert.match(text, /"assets\/icons\/keep.png": "UI"/);
});

test("bulk type assignment refuses to cross workspace boundaries", async () => {
  const store = memoryStore();
  await assert.rejects(() => updateWorkspaceAssetTypes([
    asset("file:///game-a", "assets/a.png"), asset("file:///game-b", "assets/b.png"),
  ], "Background", resolveAssetProfile("generic"), store), /one workspace/);
});
''')

Path("test/bulkAssetTypeAssignment.test.ts").write_text(r'''import assert from "node:assert/strict";
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
''')

replace_once("test/organizationPrompt.test.ts", '  assert.match(first, /Confidence: high \\/ medium \\/ low/);\n', '  assert.match(first, /Confidence: high \\/ medium \\/ low/);\n  assert.match(first, /recommended move count to be zero/);\n  assert.match(first, /Prefer metadata correction over filesystem changes/);\n  assert.ok(first.indexOf("No-change recommendations") < first.indexOf("Metadata improvements"));\n  assert.ok(first.indexOf("Metadata improvements") < first.indexOf("Recommended moves"));\n  assert.ok(first.indexOf("Recommended moves") < first.indexOf("Rejected move ideas"));\n  assert.ok(first.indexOf("Rejected move ideas") < first.indexOf("Tool false positives \/ analyzer improvements"));\n')
