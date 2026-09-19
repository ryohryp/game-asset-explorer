import * as vscode from "vscode";
import { findMissingWorkspaceAssetReferences } from "./assetHealthSearch";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerMissingAssetReferencesCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showMissingAssetReferences", async () => {
    const references = await findMissingWorkspaceAssetReferences(getAssets());
    if (references.length === 0) { void vscode.window.showInformationMessage("No deterministic missing image references found."); return; }
    const selected = await vscode.window.showQuickPick(references.map((reference) => ({ label: `$(warning) ${reference.targetPath}`, description: `${reference.sourcePath}:${reference.line + 1}`, detail: "Direct static image reference; dynamic references are not classified as missing.", reference })), { title: "Missing Asset References", placeHolder: "Select a missing reference to open its source." });
    if (!selected) return;
    const uri = vscode.Uri.parse(selected.reference.uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const start = new vscode.Position(selected.reference.line, selected.reference.character);
    const end = new vscode.Position(selected.reference.endLine, selected.reference.endCharacter);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  });
}
