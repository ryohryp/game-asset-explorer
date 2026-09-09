import * as vscode from "vscode";
import { loadAssetDetails } from "./core/assetDetails";
import { scanAssets } from "./core/assetScanner";
import { AssetGridPanel } from "./ui/assetGridPanel";
import { findWorkspaceAssetUsages, openAssetUsage } from "./usageSearch";
import { filterWorkspaceAssets, getWorkspaceAssetIdentity, WorkspaceAsset } from "./workspaceAsset";

let discoveredAssets: WorkspaceAsset[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const scanAndStore = async (showMessage: boolean): Promise<WorkspaceAsset[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      discoveredAssets = [];
      if (showMessage) {
        await vscode.window.showWarningMessage("Game Asset Explorer: Open a workspace before scanning assets.");
      }
      return discoveredAssets;
    }

    const nextAssets: WorkspaceAsset[] = [];
    const warnings: string[] = [];

    for (const workspaceFolder of workspaceFolders) {
      const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
      const assetDirectories = configuration.get<string[]>("assetDirectories", []);

      const result = await scanAssets({
        workspaceRoot: workspaceFolder.uri.fsPath,
        assetDirectories,
      });

      nextAssets.push(...result.assets.map((asset) => ({
        workspaceFolderUri: workspaceFolder.uri.toString(),
        workspaceFolderName: workspaceFolder.name,
        asset,
      })));
      warnings.push(...result.warnings.map((warning) => `${workspaceFolder.name}: ${warning}`));
    }

    discoveredAssets = nextAssets;

    if (warnings.length > 0) {
      console.warn("Game Asset Explorer asset scan warnings:\n" + warnings.join("\n"));
    }

    if (showMessage) {
      const warningSuffix = warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : "";
      await vscode.window.showInformationMessage(
        `Game Asset Explorer: Found ${discoveredAssets.length} image asset${discoveredAssets.length === 1 ? "" : "s"}${warningSuffix}.`,
      );
    }

    return discoveredAssets;
  };

  const findAsset = (identity: string): WorkspaceAsset | undefined => (
    discoveredAssets.find((asset) => getWorkspaceAssetIdentity(asset) === identity)
  );

  const scanCommand = vscode.commands.registerCommand("gameAssetExplorer.scanAssets", async () => {
    await scanAndStore(true);
  });

  const openCommand = vscode.commands.registerCommand("gameAssetExplorer.openAssetGrid", async () => {
    const panel = AssetGridPanel.show({
      extensionUri: context.extensionUri,
      onRefresh: () => scanAndStore(false),
      onSearch: (query) => filterWorkspaceAssets(discoveredAssets, query),
      onSelect: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return { status: "missing" as const };
        }

        const details = await loadAssetDetails(workspaceAsset.asset);
        return {
          ...details,
          workspaceAsset,
        };
      },
      onCopyPath: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return false;
        }

        await vscode.env.clipboard.writeText(workspaceAsset.asset.relativePath);
        return true;
      },
      onFindUsages: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return [];
        }

        return findWorkspaceAssetUsages(workspaceAsset);
      },
      onOpenUsage: openAssetUsage,
    });

    const assets = await scanAndStore(false);
    panel.update(assets);
  });

  context.subscriptions.push(scanCommand, openCommand);
}

export function deactivate(): void {
  discoveredAssets = [];
}
