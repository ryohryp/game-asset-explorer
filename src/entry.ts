import * as vscode from "vscode";
import { activate as activateExtension, deactivate as deactivateExtension, getDiscoveredAssets, onDidChangeDiscoveredAssets } from "./extension";
import { registerGenerateNewAssetPromptCommand } from "./newAssetPromptCommand";
import { registerGitImageDiffCommand } from "./gitImageDiffCommand";
import { registerVariantMatrixCommand } from "./variantMatrixCommand";
import { registerDuplicateDetectionCommand } from "./duplicateDetectionCommand";
import { registerAssetProblemsCommand } from "./assetProblemsCommand";
import { registerAssetProblemsDiagnostics } from "./assetProblemsDiagnostics";
import { registerAssetHealthDashboardCommand } from "./assetHealthDashboardCommand";
import { registerNamingProblemsCommand } from "./namingProblemsCommand";
import { registerCompareModeCommand } from "./compareModeCommand";
import { registerTransparentBoundsCommand } from "./transparentBoundsCommand";
import { registerSpriteSheetCommand } from "./spriteSheetCommand";
import { registerBatchRenameCommand } from "./batchRenameCommand";
import { registerAssetFileOperationsCommand } from "./assetFileOperationsCommand";
import { registerContactSheetCommand } from "./contactSheetCommand";
import { registerMissingAssetReferencesCommand } from "./missingAssetReferencesCommand";
import { registerAssetDependencyGraphCommand } from "./assetDependencyGraphCommand";

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
  context.subscriptions.push(
    registerGenerateNewAssetPromptCommand(),
    registerGitImageDiffCommand(),
    registerVariantMatrixCommand(getDiscoveredAssets),
    registerDuplicateDetectionCommand(getDiscoveredAssets),
    registerAssetProblemsCommand(getDiscoveredAssets),
    registerAssetProblemsDiagnostics(getDiscoveredAssets, onDidChangeDiscoveredAssets),
    registerAssetHealthDashboardCommand(getDiscoveredAssets),
    registerNamingProblemsCommand(getDiscoveredAssets),
    registerCompareModeCommand(getDiscoveredAssets),
    registerTransparentBoundsCommand(getDiscoveredAssets),
    registerSpriteSheetCommand(getDiscoveredAssets),
    registerBatchRenameCommand(getDiscoveredAssets),
    registerAssetFileOperationsCommand(getDiscoveredAssets),
    registerContactSheetCommand(getDiscoveredAssets),
    registerMissingAssetReferencesCommand(getDiscoveredAssets),
    registerAssetDependencyGraphCommand(getDiscoveredAssets),
  );
}

export function deactivate(): void {
  deactivateExtension();
}
