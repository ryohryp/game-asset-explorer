import * as vscode from "vscode";
import { activate as activateExtension, deactivate as deactivateExtension, getDiscoveredAssets } from "./extension";
import { registerGenerateNewAssetPromptCommand } from "./newAssetPromptCommand";
import { registerGitImageDiffCommand } from "./gitImageDiffCommand";
import { registerVariantMatrixCommand } from "./variantMatrixCommand";

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
  context.subscriptions.push(registerGenerateNewAssetPromptCommand(), registerGitImageDiffCommand(), registerVariantMatrixCommand(getDiscoveredAssets));
}

export function deactivate(): void {
  deactivateExtension();
}
