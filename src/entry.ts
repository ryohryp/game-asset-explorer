import * as vscode from "vscode";
import { activate as activateExtension, deactivate as deactivateExtension } from "./extension";
import { registerGenerateNewAssetPromptCommand } from "./newAssetPromptCommand";

export function activate(context: vscode.ExtensionContext): void {
  activateExtension(context);
  context.subscriptions.push(registerGenerateNewAssetPromptCommand());
}

export function deactivate(): void {
  deactivateExtension();
}
