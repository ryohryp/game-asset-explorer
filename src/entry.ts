import * as vscode from "vscode";
import { activate as activateExtension, deactivate as deactivateExtension, getDiscoveredAssets } from "./extension";
import { registerGenerateNewAssetPromptCommand } from "./newAssetPromptCommand";
import { registerGitImageDiffCommand } from "./gitImageDiffCommand";
import { registerVariantMatrixCommand } from "./variantMatrixCommand";
import { registerDuplicateDetectionCommand } from "./duplicateDetectionCommand";
import { registerAssetProblemsCommand } from "./assetProblemsCommand";
import { registerAssetHealthDashboardCommand } from "./assetHealthDashboardCommand";
import { registerNamingProblemsCommand } from "./namingProblemsCommand";
import { registerCompareModeCommand } from "./compareModeCommand";
import { registerTransparentBoundsCommand } from "./transparentBoundsCommand";

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
  context.subscriptions.push(
    registerGenerateNewAssetPromptCommand(),
    registerGitImageDiffCommand(),
    registerVariantMatrixCommand(getDiscoveredAssets),
    registerDuplicateDetectionCommand(getDiscoveredAssets),
    registerAssetProblemsCommand(getDiscoveredAssets),
    registerAssetHealthDashboardCommand(getDiscoveredAssets),
    registerNamingProblemsCommand(getDiscoveredAssets),
    registerCompareModeCommand(getDiscoveredAssets),
    registerTransparentBoundsCommand(getDiscoveredAssets),
  );
}

export function deactivate(): void {
  deactivateExtension();
}
