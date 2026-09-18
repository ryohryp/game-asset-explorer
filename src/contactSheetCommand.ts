import * as vscode from "vscode";
import { renderContactSheetSvg } from "./core/contactSheet";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerContactSheetCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.exportContactSheet", async () => {
    const assets = getAssets();
    const picked = await vscode.window.showQuickPick(
      assets.map((asset) => ({ label: asset.asset.relativePath, asset })),
      { title: "Contact Sheet Export", placeHolder: "Select two or more images", canPickMany: true },
    );
    if (!picked || picked.length < 2) return;
    const columnsText = await vscode.window.showInputBox({ title: "Contact Sheet Columns", value: "4", validateInput: boundedInteger(1, 12) });
    if (columnsText === undefined) return;
    const cellSizeText = await vscode.window.showInputBox({ title: "Contact Sheet Cell Size", value: "256", validateInput: boundedInteger(64, 1024) });
    if (cellSizeText === undefined) return;
    const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(picked[0].asset.asset.absolutePath));
    if (!workspace) return;
    const target = await vscode.window.showSaveDialog({
      title: "Export Contact Sheet",
      defaultUri: vscode.Uri.joinPath(workspace.uri, "contact-sheet.svg"),
      filters: { "SVG image": ["svg"] },
    });
    if (!target) return;
    try {
      const items = await Promise.all(picked.map(async ({ asset }) => {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(asset.asset.absolutePath));
        const mime = asset.asset.fileType === "jpg" || asset.asset.fileType === "jpeg" ? "image/jpeg" : `image/${asset.asset.fileType}`;
        return { fileName: asset.asset.fileName, dataUri: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` };
      }));
      const svg = renderContactSheetSvg(items, { columns: Number(columnsText), cellSize: Number(cellSizeText) });
      await vscode.workspace.fs.writeFile(target, Buffer.from(svg, "utf8"));
      await vscode.window.showInformationMessage(`Game Asset Explorer: Contact sheet exported to ${target.fsPath}`);
    } catch (error) {
      await vscode.window.showErrorMessage(`Game Asset Explorer: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function boundedInteger(min: number, max: number): (value: string) => string | undefined {
  return (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? undefined : `Enter an integer from ${min} to ${max}.`;
  };
}
