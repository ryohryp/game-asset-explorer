import * as vscode from "vscode";
import { activate as activateExtension, deactivate as deactivateExtension } from "./extension";
import { registerGenerateNewAssetPromptCommand } from "./newAssetPromptCommand";
import { registerGitImageDiffCommand } from "./gitImageDiffCommand";

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
  context.subscriptions.push(registerGenerateNewAssetPromptCommand(), registerGitImageDiffCommand());
}

export function deactivate(): void {
  deactivateExtension();
}
