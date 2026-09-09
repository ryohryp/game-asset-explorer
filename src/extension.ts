import * as vscode from "vscode";
import { AssetRecord, scanAssets } from "./core/assetScanner";

let discoveredAssets: AssetRecord[] = [];

export function activate(context: vscode.ExtensionContext): void {
  const scanCommand = vscode.commands.registerCommand("gameAssetExplorer.scanAssets", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      discoveredAssets = [];
      await vscode.window.showWarningMessage("Game Asset Explorer: Open a workspace before scanning assets.");
      return;
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

    const warningSuffix = warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : "";
    await vscode.window.showInformationMessage(
      `Game Asset Explorer: Found ${discoveredAssets.length} image asset${discoveredAssets.length === 1 ? "" : "s"}${warningSuffix}.`,
    );
  });

  context.subscriptions.push(scanCommand);
}

export function deactivate(): void {
  discoveredAssets = [];
}
