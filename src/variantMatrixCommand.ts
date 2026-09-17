import * as vscode from "vscode";
import { buildVariantMatrix } from "./core/variantMatrix";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerVariantMatrixCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showVariantMatrix", async () => {
    const matrix = buildVariantMatrix(getAssets());
    if (matrix.rows.length === 0) {
      void vscode.window.showInformationMessage("Game Asset Explorer: No simple filename variant series found.");
      return;
    }
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.variantMatrix", "Variant Matrix", vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = render(matrix);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "open") return;
      const path = (message as { path?: unknown }).path;
      if (typeof path !== "string") return;
      const target = getAssets().find((asset) => asset.asset.absolutePath === path);
      if (target) await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target.asset.absolutePath));
    });
  });
}

function render(matrix: ReturnType<typeof buildVariantMatrix>): string {
  const head = matrix.variants.map((variant) => `<th>${escapeHtml(variant)}</th>`).join("");
  const rows = matrix.rows.map((row) => `<tr><th>${escapeHtml(row.baseName)}</th>${matrix.variants.map((variant) => {
    const asset = row.variants[variant];
    return asset
      ? `<td><button data-path="${escapeHtml(asset.asset.absolutePath)}" title="${escapeHtml(asset.asset.relativePath)}">✓</button></td>`
      : `<td class="missing">—</td>`;
  }).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--vscode-panel-border);padding:8px;text-align:center}th:first-child{text-align:left}.missing{opacity:.45}button{width:100%;background:transparent;color:var(--vscode-textLink-foreground);border:0;cursor:pointer;font-size:16px}
</style></head><body><h1>Variant Matrix</h1><p>Simple filename convention: <code>base_variant.ext</code> or <code>base-variant.ext</code>. Blank cells are potential missing variants.</p><table><thead><tr><th>Series</th>${head}</tr></thead><tbody>${rows}</tbody></table><script>const vscode=acquireVsCodeApi();document.addEventListener('click',e=>{const b=e.target.closest('button[data-path]');if(b)vscode.postMessage({type:'open',path:b.dataset.path});});</script></body></html>`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!)); }
