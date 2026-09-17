import * as vscode from "vscode";
import { findExactDuplicateAssets } from "./core/duplicateDetection";
import type { WorkspaceAsset } from "./workspaceAsset";

export function registerDuplicateDetectionCommand(getAssets: () => readonly WorkspaceAsset[]): vscode.Disposable {
  return vscode.commands.registerCommand("gameAssetExplorer.showDuplicates", async () => {
    const groups = await findExactDuplicateAssets(getAssets());
    if (groups.length === 0) {
      void vscode.window.showInformationMessage("Game Asset Explorer: No exact duplicate images found.");
      return;
    }
    const panel = vscode.window.createWebviewPanel("gameAssetExplorer.duplicates", "Duplicate Images", vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = render(groups);
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "open") return;
      const path = (message as { path?: unknown }).path;
      if (typeof path !== "string") return;
      const target = getAssets().find((asset) => asset.asset.absolutePath === path);
      if (target) await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target.asset.absolutePath));
    });
  });
}

function render(groups: Awaited<ReturnType<typeof findExactDuplicateAssets>>): string {
  const body = groups.map((group, index) => `<section><h2>Duplicate group ${index + 1}</h2>${group.assets.map(({ asset, sizeBytes }) =>
    `<button data-path="${escapeHtml(asset.asset.absolutePath)}">${escapeHtml(asset.asset.relativePath)} <span>${formatBytes(sizeBytes)}</span></button>`
  ).join("")}</section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: var(--vscode-font-family); padding: 16px; }
    section { margin-bottom: 20px; }
    button { display: flex; justify-content: space-between; width: 100%; text-align: left; margin: 4px 0; padding: 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; }
  </style></head><body><h1>Exact Duplicate Images</h1>${body}<script>
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-path]");
      if (button) acquireVsCodeApi().postMessage({ type: "open", path: button.dataset.path });
    });
  </script></body></html>`;
}

function formatBytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
