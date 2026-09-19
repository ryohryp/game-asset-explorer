import * as path from "node:path";
import * as vscode from "vscode";
import { planImageRename, planReferenceEdits, SAFE_RENAME_WARNING } from "./core/safeRename";
import { getWorkspaceFolderForAsset, offsetToPosition, readWorkspaceTextFiles } from "./usageSearch";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerSafeRenameCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.safeRenameReferences", async () => {
    const picked = await vscode.window.showQuickPick(
      getAssets().map((asset) => ({ label: asset.asset.relativePath, description: asset.workspaceFolderName, asset })),
      { title: "Safe Rename References", placeHolder: "Select an image to rename" },
    );
    if (!picked) return;
    const name = await vscode.window.showInputBox({ title: "Safe Rename References", prompt: "New filename (same directory and extension)", value: picked.asset.asset.fileName });
    if (name === undefined) return;
    try {
      await renameAssetReferences(picked.asset, name);
    } catch (error) {
      await vscode.window.showErrorMessage(`Game Asset Explorer: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export async function renameAssetReferences(asset: WorkspaceAsset, newFileName: string): Promise<void> {
  const folder = getWorkspaceFolderForAsset(asset);
  if (!folder) throw new Error("The asset workspace is no longer open.");
  const source = asset.asset.relativePath;
  const target = planImageRename(source, newFileName);
  const sourceUri = vscode.Uri.joinPath(folder.uri, ...source.split("/"));
  if (path.resolve(sourceUri.fsPath) !== path.resolve(asset.asset.absolutePath)) throw new Error("Asset must be inside its workspace.");
  const targetUri = vscode.Uri.joinPath(folder.uri, ...target.split("/"));
  const sourceStat = await preflight(sourceUri, targetUri);
  const files = await readWorkspaceTextFiles(folder);
  const plans = files.map((file) => ({ file, ...planReferenceEdits(file.text, source, target, file.sourcePath) }));
  const changed = plans.filter((plan) => plan.edits.length > 0);
  const count = changed.reduce((sum, plan) => sum + plan.edits.length, 0);
  const preview = [
    "Safe Rename References", `${folder.name}: ${source} -> ${target}`, "", SAFE_RENAME_WARNING,
    "References must be complete quoted workspace paths. Filename-only, parent-relative, suffixed/escaped paths, concatenations and files containing templates are left for manual review.",
    `Detected edits: ${count}; other detected matches left unchanged: ${plans.reduce((sum, plan) => sum + plan.skippedMatches, 0)}`,
    "", ...changed.flatMap(({ file, edits }) => edits.map((edit) => {
      const position = offsetToPosition(file.text, edit.startOffset);
      return `${file.sourcePath}:${position.line + 1}:${position.character + 1}\n  ${edit.before} -> ${edit.after}`;
    })),
  ].join("\n");
  const previewDocument = await vscode.workspace.openTextDocument({ content: preview, language: "plaintext" });
  await vscode.window.showTextDocument(previewDocument, { preview: true });
  const confirm = await vscode.window.showWarningMessage(
    `Rename ${source} to ${target} and update ${count} static reference(s) in ${changed.length} file(s)?`,
    { modal: true, detail: `${SAFE_RENAME_WARNING}\nReview the preview before confirming. Reference edits are applied to editor buffers; save the changed files after review.` },
    "Rename and Update References",
  );
  if (confirm !== "Rename and Update References") return;

  // Revalidate both disk and editor buffers after the user has reviewed the preview.
  const documents: { document: vscode.TextDocument; version: number }[] = [];
  const edit = new vscode.WorkspaceEdit();
  // Rename first so a resource-operation failure cannot precede reference changes.
  edit.renameFile(sourceUri, targetUri, { overwrite: false, ignoreIfExists: false });
  for (const plan of changed) {
    const document = await vscode.workspace.openTextDocument(plan.file.uri);
    const diskText = new TextDecoder("utf-8", { fatal: true }).decode(await vscode.workspace.fs.readFile(plan.file.uri));
    if (document.getText() !== plan.file.text || diskText !== plan.file.text || document.isDirty) {
      throw new Error(`Reference file changed or has unsaved edits: ${plan.file.sourcePath}. Save and preview again.`);
    }
    documents.push({ document, version: document.version });
    for (const replacement of plan.edits) {
      edit.replace(plan.file.uri, new vscode.Range(document.positionAt(replacement.startOffset), document.positionAt(replacement.endOffset)), replacement.after);
    }
  }
  const currentStat = await preflight(sourceUri, targetUri);
  if (currentStat.size !== sourceStat.size || currentStat.mtime !== sourceStat.mtime || currentStat.ctime !== sourceStat.ctime) {
    throw new Error("Source image changed during preview. Preview again.");
  }
  if (documents.some(({ document, version }) => document.version !== version || document.isClosed || document.isDirty)) {
    throw new Error("Reference files changed during preflight. Preview again.");
  }
  try {
    if (!await vscode.workspace.applyEdit(edit)) throw new Error("Workspace edit was not applied.");
  } catch {
    throw new Error("Rename workspace edit failed. Review the image paths and editor changes and use VS Code Undo before retrying; a mixed file/text edit may not be fully atomic.");
  }
  await vscode.window.showInformationMessage(`Game Asset Explorer: Renamed image and updated ${count} reference(s). Save changed reference files. ${SAFE_RENAME_WARNING}`);
}

async function preflight(source: vscode.Uri, target: vscode.Uri): Promise<vscode.FileStat> {
  const stat = await vscode.workspace.fs.stat(source);
  if (stat.type !== vscode.FileType.File) throw new Error("Source must be a regular image file.");
  const siblings = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(target, ".."));
  if (siblings.some(([name]) => name.toLowerCase() === path.basename(target.fsPath).toLowerCase())) {
    throw new Error("Destination already exists. No changes were made.");
  }
  try {
    await vscode.workspace.fs.stat(target);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return stat;
    throw error;
  }
  throw new Error("Destination already exists. No changes were made.");
}
