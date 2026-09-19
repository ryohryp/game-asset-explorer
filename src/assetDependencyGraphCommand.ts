import * as vscode from "vscode";
import { buildAssetDependencyView } from "./core/assetDependencyGraph";
import { findWorkspaceAssetUsages, openAssetUsage } from "./usageSearch";
import { WorkspaceAsset } from "./workspaceAsset";

export function registerAssetDependencyGraphCommand(
  getAssets: () => readonly WorkspaceAsset[],
): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showAssetDependencyGraph", async () => {
    const assets = getAssets();
    if (assets.length === 0) {
      await vscode.window.showInformationMessage("Game Asset Explorer: No image assets found.");
      return;
    }
    type AssetPick = vscode.QuickPickItem & { asset: WorkspaceAsset };
    const selected = await vscode.window.showQuickPick<AssetPick>(
      assets.map((asset) => ({
        label: asset.asset.fileName,
        description: asset.asset.relativePath,
        detail: asset.workspaceFolderName,
        asset,
      })),
      { title: "Asset Dependency Graph", placeHolder: "Select an asset to inspect direct static references", matchOnDescription: true },
    );
    if (!selected) return;

    const usages = await findWorkspaceAssetUsages(selected.asset);
    const view = buildAssetDependencyView(selected.asset.asset.relativePath, usages);
    type SourcePick = vscode.QuickPickItem & { sourcePath?: string };
    const items: SourcePick[] = [
      { label: `Asset: ${view.assetPath}`, description: `${view.sources.length} referencing file${view.sources.length === 1 ? "" : "s"}` },
      { label: view.caveat, kind: vscode.QuickPickItemKind.Separator },
      ...view.sources.map((source) => ({
        label: `$(arrow-right) ${source.sourcePath}`,
        description: `${source.usageCount} direct reference${source.usageCount === 1 ? "" : "s"}`,
        detail: `First match: line ${source.firstLine + 1}`,
        sourcePath: source.sourcePath,
      })),
    ];
    if (view.sources.length === 0) {
      items.push({ label: "$(info) No direct static references found", description: "Dynamic references may still exist" });
    }
    const source = await vscode.window.showQuickPick(items, {
      title: `Asset Dependencies · ${selected.asset.asset.fileName}`,
      placeHolder: "reference source → selected asset",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!source?.sourcePath) return;
    const usage = usages.find((item) => item.sourcePath === source.sourcePath);
    if (usage) await openAssetUsage(usage);
  });
}
