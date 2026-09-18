import * as path from "node:path";
import * as vscode from "vscode";
import { planBatchRename, type BatchRenameOptions } from "./core/batchRename";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerBatchRenameCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.batchRename", async () => {
    const picked = await vscode.window.showQuickPick(
      getAssets().map((asset) => ({ label: asset.asset.relativePath, asset })),
      { title: "Batch Rename", placeHolder: "Select assets to rename", canPickMany: true },
    );
    if (!picked?.length) return;
    const prefix = await vscode.window.showInputBox({ title: "Batch Rename", prompt: "Prefix (optional)" });
    if (prefix === undefined) return;
    const suffix = await vscode.window.showInputBox({ title: "Batch Rename", prompt: "Suffix (optional)" });
    if (suffix === undefined) return;
    const replaceFrom = await vscode.window.showInputBox({ title: "Batch Rename", prompt: "Replace text (optional)" });
    if (replaceFrom === undefined) return;
    const replaceTo = replaceFrom ? await vscode.window.showInputBox({ title: "Batch Rename", prompt: `Replace "${replaceFrom}" with` }) : "";
    if (replaceTo === undefined) return;
    const caseChoice = await vscode.window.showQuickPick(["Keep case", "lowercase", "UPPERCASE"], { title: "Batch Rename", placeHolder: "Case conversion" });
    if (!caseChoice) return;
    const numberStartText = await vscode.window.showInputBox({ title: "Batch Rename", prompt: "Numbering start (optional; blank disables numbering)" });
    if (numberStartText === undefined) return;
    const numberStart = numberStartText === "" ? undefined : Number(numberStartText);
    if (numberStartText !== "" && (!Number.isInteger(numberStart) || numberStart! < 0)) {
      await vscode.window.showErrorMessage("Game Asset Explorer: Numbering start must be a non-negative integer.");
      return;
    }
    const options: BatchRenameOptions = {
      prefix,
      suffix,
      replace: replaceFrom ? { from: replaceFrom, to: replaceTo } : undefined,
      case: caseChoice === "lowercase" ? "lower" : caseChoice === "UPPERCASE" ? "upper" : "none",
      numbering: numberStart === undefined ? undefined : { start: numberStart, pad: String(numberStart).length },
    };
    const plan = planBatchRename(picked.map(({ asset }) => ({ relativePath: asset.asset.relativePath, fileName: asset.asset.fileName })), options);
    if (plan.collisions.length) {
      await vscode.window.showErrorMessage(`Game Asset Explorer: Rename collision: ${plan.collisions.join(", ")}`);
      return;
    }
    const existing = new Set(getAssets().map((asset) => asset.asset.relativePath.toLowerCase()));
    const selected = new Set(picked.map(({ asset }) => asset.asset.relativePath.toLowerCase()));
    const externalCollision = plan.items.find((item) => existing.has(item.targetRelativePath.toLowerCase()) && item.targetRelativePath.toLowerCase() !== item.input.relativePath.toLowerCase());
    if (externalCollision) {
      await vscode.window.showErrorMessage(`Game Asset Explorer: Target already exists: ${externalCollision.targetRelativePath}`);
      return;
    }
    const preview = plan.items.map((item) => `${item.input.relativePath} → ${item.targetRelativePath}`).join("\n");
    const confirm = await vscode.window.showWarningMessage(`Rename ${plan.items.length} asset(s)?\n${preview}`, { modal: true }, "Rename");
    if (confirm !== "Rename") return;
    const byPath = new Map(picked.map(({ asset }) => [asset.asset.relativePath, asset]));
    for (const item of plan.items) {
      if (item.input.relativePath === item.targetRelativePath) continue;
      const asset = byPath.get(item.input.relativePath)!;
      await vscode.workspace.fs.rename(vscode.Uri.file(asset.asset.absolutePath), vscode.Uri.file(path.join(path.dirname(asset.asset.absolutePath), item.targetFileName)), { overwrite: false });
    }
    await vscode.window.showInformationMessage(`Game Asset Explorer: Renamed ${plan.items.length} asset(s).`);
  });
}
