import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import { readPngTransparentBounds } from "./core/transparentBounds";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerTransparentBoundsCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showTransparentBounds", async () => {
    const assets = getAssets().filter(item => item.asset.fileType === "png");
    const pick = await vscode.window.showQuickPick(assets.map(item => ({ label: `$(file-media) ${item.asset.relativePath}`, detail: item.workspaceFolderName, item })), { title: "Select a PNG to inspect transparent bounds" });
    if (!pick) return;
    const bounds = readPngTransparentBounds(await readFile(pick.item.asset.absolutePath));
    if (!bounds) { void vscode.window.showInformationMessage("Game Asset Explorer: Transparent bounds are unavailable for this PNG format."); return; }
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.transparentBounds", "Transparent Bounds", vscode.ViewColumn.One, { localResourceRoots: [vscode.Uri.parse(pick.item.workspaceFolderUri)] });
    const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(pick.item.asset.absolutePath));
    panel.webview.html = render(pick.item.asset.relativePath, imageUri.toString(), bounds);
  });
}

function render(path: string, imageUri: string, b: ReturnType<typeof readPngTransparentBounds> & {}): string {
  const right = b.width - b.x - b.contentWidth, bottom = b.height - b.y - b.contentHeight;
  const box = b.contentWidth && b.contentHeight ? `<div class="bounds" style="left:${b.x / b.width * 100}%;top:${b.y / b.height * 100}%;width:${b.contentWidth / b.width * 100}%;height:${b.contentHeight / b.height * 100}%"></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground)}.meta{margin-bottom:12px;color:var(--vscode-descriptionForeground)}.canvas{position:relative;display:inline-block;max-width:80vw;background-image:linear-gradient(45deg,#8884 25%,transparent 25%),linear-gradient(-45deg,#8884 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#8884 75%),linear-gradient(-45deg,transparent 75%,#8884 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.canvas img{display:block;max-width:80vw;max-height:70vh}.bounds{position:absolute;box-sizing:border-box;border:2px solid var(--vscode-editorWarning-foreground);pointer-events:none}</style></head><body><h2>${escapeHtml(path)}</h2><div class="meta">Canvas ${b.width} × ${b.height} · Content ${b.contentWidth} × ${b.contentHeight} · Transparent margins: top ${b.y}, right ${right}, bottom ${bottom}, left ${b.x}</div><div class="canvas"><img src="${escapeHtml(imageUri)}" alt="">${box}</div></body></html>`;
}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));}
