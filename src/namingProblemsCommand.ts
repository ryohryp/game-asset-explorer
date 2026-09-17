import * as vscode from "vscode";
import { findNamingProblems } from "./core/namingProblems";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerNamingProblemsCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showNamingProblems", async () => {
    const problems = findNamingProblems(getAssets());
    if (problems.length === 0) {
      void vscode.window.showInformationMessage("Game Asset Explorer: No naming problem candidates found.");
      return;
    }
    const items = problems.map((problem) => ({
      label: problem.asset.asset.relativePath,
      description: problem.reasons.join("; "),
      problem,
    }));
    const selected = await vscode.window.showQuickPick(items, { title: "Naming Problems", placeHolder: "Select a candidate to open it" });
    if (selected) await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(selected.problem.asset.asset.absolutePath));
  });
}
