import * as vscode from "vscode";
import { findAssetProblems } from "./core/assetProblems";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerAssetProblemsCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showAssetProblems", async () => {
    const problems = await findAssetProblems(getAssets());
    if (problems.length === 0) {
      void vscode.window.showInformationMessage("Game Asset Explorer: No large asset problem candidates found.");
      return;
    }
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.assetProblems", "Asset Problems", vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = render(problems);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "open") return;
      const path = (message as { path?: unknown }).path;
      if (typeof path !== "string") return;
      const target = getAssets().find((asset) => asset.asset.absolutePath === path);
      if (target) await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target.asset.absolutePath));
    });
  });
}

function render(problems: Awaited<ReturnType<typeof findAssetProblems>>): string {
  const body = problems.map((item) => `<button data-path="${escapeHtml(item.asset.asset.absolutePath)}"><strong>${escapeHtml(item.asset.asset.relativePath)}</strong><span>${item.width && item.height ? `${item.width}×${item.height} · ` : ""}${formatBytes(item.sizeBytes)}</span><small>${item.reasons.map(escapeHtml).join("<br>")}</small></button>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);padding:16px}button{display:grid;grid-template-columns:1fr auto;width:100%;text-align:left;margin:6px 0;padding:10px;border:1px solid var(--vscode-contrast-border);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}small{grid-column:1/-1;color:var(--vscode-descriptionForeground)}</style></head><body><h1>Asset Problems</h1><p>Conservative candidates: files larger than 5 MiB or dimensions above 4096×4096. Project-specific rules can replace these defaults later.</p>${body}<script>document.addEventListener("click",(e)=>{const b=e.target.closest("button[data-path]");if(b)acquireVsCodeApi().postMessage({type:"open",path:b.dataset.path})})</script></body></html>`;
}

function formatBytes(value: number): string { return value < 1024 * 1024 ? `${value / 1024} KB` : `${(value / (1024 * 1024)).toFixed(1)} MiB`; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char); }
