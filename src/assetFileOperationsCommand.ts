import * as vscode from "vscode";
import { normalizeRelativePath, planAssetFileOperation } from "./core/assetFileOperation";
import type { WorkspaceAsset } from "./workspaceAsset";

type OperationChoice = "Move" | "Copy" | "Replace";

export function registerAssetFileOperationsCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.assetFileOperations", async () => {
    const assets = getAssets();
    const picked = await vscode.window.showQuickPick(
      assets.map((asset) => ({ label: asset.asset.relativePath, asset })),
      { title: "Asset File Operations", placeHolder: "Select an asset" },
    );
    if (!picked) return;
    const operation = await vscode.window.showQuickPick(["Move", "Copy", "Replace"] as OperationChoice[], {
      title: "Asset File Operations",
      placeHolder: "Choose an operation",
    });
    if (!operation) return;

    if (operation === "Replace") {
      await replaceAsset(picked.asset, assets);
      return;
    }
    await moveOrCopyAsset(picked.asset, operation as "Move" | "Copy", assets);
  });
}

async function moveOrCopyAsset(source: WorkspaceAsset, operation: "Move" | "Copy", assets: readonly WorkspaceAsset[]): Promise<void> {
  const targetInput = await vscode.window.showInputBox({
    title: `${operation} Asset`,
    prompt: "Target path relative to the workspace",
    value: source.asset.relativePath,
  });
  if (targetInput === undefined) return;
  try {
    const plan = planAssetFileOperation(operation.toLowerCase() as "move" | "copy", source.asset.relativePath, targetInput);
    const workspaceUri = vscode.Uri.parse(source.workspaceFolderUri);
    const targetUri = vscode.Uri.joinPath(workspaceUri, ...plan.targetRelativePath.split("/"));
    const collision = assets.some((asset) => asset.workspaceFolderUri === source.workspaceFolderUri
      && asset.asset.relativePath.toLowerCase() === plan.targetRelativePath.toLowerCase());
    if (collision) {
      await vscode.window.showErrorMessage(`Game Asset Explorer: Target already exists: ${plan.targetRelativePath}`);
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      `${operation} ${plan.sourceRelativePath} 竊・${plan.targetRelativePath}?`,
      { modal: true }, operation,
    );
    if (confirm !== operation) return;
    const sourceUri = vscode.Uri.file(source.asset.absolutePath);
    const parentSegments = plan.targetRelativePath.split("/").slice(0, -1);
    if (parentSegments.length) await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceUri, ...parentSegments));
    if (operation === "Move") await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: false });
    else await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: false });
    await vscode.window.showInformationMessage(`Game Asset Explorer: ${operation} completed.`);
  } catch (error) {
    await vscode.window.showErrorMessage(`Game Asset Explorer: ${formatError(error)}`);
  }
}

async function replaceAsset(target: WorkspaceAsset, assets: readonly WorkspaceAsset[]): Promise<void> {
  const candidates = assets.filter((asset) => asset.workspaceFolderUri === target.workspaceFolderUri
    && asset.asset.relativePath !== target.asset.relativePath);
  const replacement = await vscode.window.showQuickPick(
    candidates.map((asset) => ({ label: asset.asset.relativePath, asset })),
    { title: "Replace Asset", placeHolder: `Choose image bytes to replace ${target.asset.relativePath}` },
  );
  if (!replacement) return;
  const confirm = await vscode.window.showWarningMessage(
    `Replace ${target.asset.relativePath} with the contents of ${replacement.asset.asset.relativePath}?`,
    { modal: true }, "Replace",
  );
  if (confirm !== "Replace") return;
  const targetUri = vscode.Uri.file(target.asset.absolutePath);
  let originalBytes: Uint8Array | undefined;
  try {
    normalizeRelativePath(target.asset.relativePath);
    originalBytes = await vscode.workspace.fs.readFile(targetUri);
    const replacementBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(replacement.asset.asset.absolutePath));
    await vscode.workspace.fs.writeFile(targetUri, replacementBytes);
    await vscode.window.showInformationMessage("Game Asset Explorer: Replace completed.");
  } catch (error) {
    if (originalBytes) {
      try { await vscode.workspace.fs.writeFile(targetUri, originalBytes); } catch { /* best-effort rollback */ }
    }
    await vscode.window.showErrorMessage(`Game Asset Explorer: ${formatError(error)}`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
