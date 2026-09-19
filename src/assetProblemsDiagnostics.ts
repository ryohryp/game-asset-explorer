import * as vscode from "vscode";
import { loadWorkspaceAssetRules } from "./assetRulesWorkspace";
import { findAssetProblems, formatAssetProblemSummary } from "./core/assetProblems";
import { resolveAssetProblemLimits } from "./core/assetRules";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerAssetProblemsDiagnostics(
  getAssets: () => readonly WorkspaceAsset[],
  onDidChangeAssets: vscode.Event<readonly WorkspaceAsset[]>,
): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection("gameAssetExplorer");
  let sequence = 0;

  const refresh = async (assets: readonly WorkspaceAsset[]): Promise<void> => {
    const current = ++sequence;
    try {
      const rules = await loadWorkspaceAssetRules();
      const problems = await findAssetProblems(assets, (asset) =>
        resolveAssetProblemLimits(asset.asset.relativePath, rules.get(asset.workspaceFolderUri)));
      if (current !== sequence) return;
      collection.clear();
      for (const problem of problems) {
        const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), formatAssetProblemSummary(problem), vscode.DiagnosticSeverity.Warning);
        diagnostic.source = "Game Asset Explorer";
        collection.set(vscode.Uri.file(problem.asset.asset.absolutePath), [diagnostic]);
      }
    } catch (error) {
      if (current === sequence) collection.clear();
      console.warn("Game Asset Explorer: Unable to refresh asset problem diagnostics.", error);
    }
  };

  void refresh(getAssets());
  return vscode.Disposable.from(collection, onDidChangeAssets((assets) => void refresh(assets)));
}
