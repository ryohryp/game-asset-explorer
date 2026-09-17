import * as vscode from "vscode";
import { ASSET_RULES_PATH, parseAssetRules, type AssetRulesConfig } from "./core/assetRules";

export async function loadWorkspaceAssetRules(): Promise<Map<string, AssetRulesConfig>> {
  const configs = new Map<string, AssetRulesConfig>();
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const uri = vscode.Uri.joinPath(folder.uri, ASSET_RULES_PATH);
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      configs.set(folder.uri.toString(), parseAssetRules(text));
    } catch (error) {
      if (isFileNotFound(error)) continue;
      throw new Error(`${folder.name}: invalid ${ASSET_RULES_PATH}: ${formatError(error)}`);
    }
  }
  return configs;
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError && error.code === "FileNotFound";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
