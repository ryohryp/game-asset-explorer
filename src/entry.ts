import * as vscode from "vscode";
import { activate as activateExtension, deactivate as deactivateExtension, getDiscoveredAssets } from "./extension";
import { registerGenerateNewAssetPromptCommand } from "./newAssetPromptCommand";
import { registerGitImageDiffCommand } from "./gitImageDiffCommand";
import { registerVariantMatrixCommand } from "./variantMatrixCommand";
import { registerDuplicateDetectionCommand } from "./duplicateDetectionCommand";
import { registerAssetProblemsCommand } from "./assetProblemsCommand";
import { registerAssetHealthDashboardCommand } from "./assetHealthDashboardCommand";

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
  context.subscriptions.push(
    registerGenerateNewAssetPromptCommand(),
    registerGitImageDiffCommand(),
    registerVariantMatrixCommand(getDiscoveredAssets),
    registerDuplicateDetectionCommand(getDiscoveredAssets),
    registerAssetProblemsCommand(getDiscoveredAssets),
    registerAssetHealthDashboardCommand(getDiscoveredAssets),
  );
}

export function deactivate(): void {
  deactivateExtension();
}
