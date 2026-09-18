import * as vscode from "vscode";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerSpriteSheetCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showSpriteSheet", async () => {
    const pick = await vscode.window.showQuickPick(getAssets().map(item => ({ label: `$(file-media) ${item.asset.relativePath}`, detail: item.workspaceFolderName, item })), { title: "Select a sprite sheet" });
    if (!pick) return;
    const rows = await askCount("Rows"); if (!rows) return;
    const columns = await askCount("Columns"); if (!columns) return;
    const root = vscode.Uri.parse(pick.item.workspaceFolderUri);
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.spriteSheet", `Sprite Sheet: ${pick.item.asset.fileName}`, vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [root] });
    const uri = panel.webview.asWebviewUri(vscode.Uri.file(pick.item.asset.absolutePath));
    panel.webview.html = render(uri.toString(), rows, columns);
  });
}

async function askCount(label: string): Promise<number | undefined> {
  const value = await vscode.window.showInputBox({ title: `Sprite Sheet ${label}`, prompt: `Enter the number of ${label.toLowerCase()}`, value: "4", validateInput: v => /^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 64 ? undefined : "Enter an integer from 1 to 64" });
  return value ? Number(value) : undefined;
}

function render(src: string, rows: number, columns: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground)}.grid{display:grid;grid-template-columns:repeat(${columns},minmax(100px,1fr));gap:8px}.cell{border:1px solid var(--vscode-panel-border);padding:6px}.cell canvas{width:100%;image-rendering:pixelated;background:var(--vscode-editor-background)}.cell:focus{outline:2px solid var(--vscode-focusBorder)}.label{font-size:12px;color:var(--vscode-descriptionForeground)}</style></head><body><h1>Sprite Sheet · ${rows} × ${columns}</h1><div id="grid" class="grid"></div><img id="source" src="${escapeHtml(src)}" hidden><script>const img=document.getElementById('source'),grid=document.getElementById('grid');img.onload=()=>{const w=img.naturalWidth/${columns},h=img.naturalHeight/${rows};for(let r=0;r<${rows};r++)for(let c=0;c<${columns};c++){const i=r*${columns}+c,box=document.createElement('div');box.className='cell';box.tabIndex=0;const canvas=document.createElement('canvas');canvas.width=Math.ceil(w);canvas.height=Math.ceil(h);canvas.getContext('2d').drawImage(img,c*w,r*h,w,h,0,0,canvas.width,canvas.height);box.append(canvas);const label=document.createElement('div');label.className='label';label.textContent='#'+i+' · row '+(r+1)+', col '+(c+1);box.append(label);box.addEventListener('click',()=>{box.style.gridColumn='1 / -1';canvas.style.width='auto';canvas.style.maxWidth='100%';});grid.append(box);}};</script></body></html>`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c] ?? c)); }
