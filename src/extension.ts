import * as vscode from "vscode";
import { AssetRecord, scanAssets } from "./core/assetScanner";
import { AssetGridPanel } from "./ui/assetGridPanel";

let discoveredAssets: AssetRecord[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const scanAndStore = async (showMessage: boolean): Promise<AssetRecord[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      discoveredAssets = [];
      if (showMessage) {
        await vscode.window.showWarningMessage("Game Asset Explorer: Open a workspace before scanning assets.");
      }
      return discoveredAssets;
    }

    const nextAssets: AssetRecord[] = [];
    const warnings: string[] = [];

    for (const workspaceFolder of workspaceFolders) {
      const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
      const assetDirectories = configuration.get<string[]>("assetDirectories", []);

      const result = await scanAssets({
        workspaceRoot: workspaceFolder.uri.fsPath,
        assetDirectories,
      });

      nextAssets.push(...result.assets);
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

  const scanCommand = vscode.commands.registerCommand("gameAssetExplorer.scanAssets", async () => {
    await scanAndStore(true);
  });

  const openCommand = vscode.commands.registerCommand("gameAssetExplorer.openAssetGrid", async () => {
    const panel = AssetGridPanel.show({
      extensionUri: context.extensionUri,
      onRefresh: () => scanAndStore(false),
    });

    const assets = await scanAndStore(false);
    panel.update(assets);
  });

  context.subscriptions.push(scanCommand, openCommand);
}

export function deactivate(): void {
  discoveredAssets = [];
}
