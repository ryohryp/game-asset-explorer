import { readFile, stat } from "node:fs/promises";
import * as vscode from "vscode";
import { readImageDimensions } from "./core/assetProblems";
import type { WorkspaceAsset } from "./workspaceAsset";

type CompareAsset = { item: WorkspaceAsset; sizeBytes: number; width?: number; height?: number };

export function registerCompareModeCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showCompareMode", async () => {
    const assets = getAssets();
    if (assets.length < 2) { void vscode.window.showInformationMessage("Game Asset Explorer: At least two images are required to compare."); return; }
    const first = await pickAsset(assets, "Select the first image to compare"); if (!first) return;
    const second = await pickAsset(assets.filter(a => a.asset.absolutePath !== first.asset.absolutePath), "Select the second image to compare"); if (!second) return;
    const compared = await Promise.all([describe(first), describe(second)]);
    const roots = [...new Map(compared.map(a => [a.item.workspaceFolderUri, vscode.Uri.parse(a.item.workspaceFolderUri)])).values()];
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.compareMode", "Compare Images", vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: roots });
    panel.webview.html = render(compared, panel.webview);
  });
}
async function pickAsset(assets: readonly WorkspaceAsset[], title: string): Promise<WorkspaceAsset | undefined> {
  const pick = await vscode.window.showQuickPick(assets.map(item => ({ label: `$(file-media) ${item.asset.relativePath}`, detail: item.workspaceFolderName, item })), { title }); return pick?.item;
}
async function describe(item: WorkspaceAsset): Promise<CompareAsset> { const [buffer, info] = await Promise.all([readFile(item.asset.absolutePath), stat(item.asset.absolutePath)]); return { item, sizeBytes: info.size, ...readImageDimensions(buffer) }; }
function render(items: CompareAsset[], webview: vscode.Webview): string {
  const panes = items.map(({item,sizeBytes,width,height}) => { const uri=webview.asWebviewUri(vscode.Uri.file(item.asset.absolutePath)); return `<section><h2>${esc(item.asset.relativePath)}</h2><div class="meta">${width&&height?`${width} × ${height}`:"Dimensions unavailable"} · ${fmt(sizeBytes)}</div><div class="frame"><img src="${esc(uri.toString())}" alt=""></div></section>`; }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground)}.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}section{min-width:0}h2{font-size:13px}.meta{color:var(--vscode-descriptionForeground);margin-bottom:8px}.frame{height:65vh;overflow:auto;display:flex;align-items:flex-start;justify-content:center;border:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}img{max-width:none;transform-origin:top center}</style></head><body><div class="toolbar"><label>Zoom <input id="zoom" type="range" min="25" max="400" value="100" step="25"></label><span id="value">100%</span></div><div class="grid">${panes}</div><script>const slider=document.getElementById('zoom'), value=document.getElementById('value'); slider.addEventListener('input',()=>{const z=Number(slider.value);value.textContent=z+'%';document.querySelectorAll('img').forEach(img=>{img.style.width=z+'%';img.style.height='auto';});});</script></body></html>`;
}
function fmt(n:number){return n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(1)} MB`;}
function esc(v:string){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));}

