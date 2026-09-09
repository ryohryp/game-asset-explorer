import * as path from "node:path";
import * as vscode from "vscode";
import { AssetRecord } from "../core/assetScanner";

export interface AssetGridPanelOptions {
  extensionUri: vscode.Uri;
  onRefresh: () => Promise<AssetRecord[]>;
}

export class AssetGridPanel {
  private static currentPanel: AssetGridPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly onRefresh: () => Promise<AssetRecord[]>;
  private assets: AssetRecord[] = [];

  static show(options: AssetGridPanelOptions): AssetGridPanel {
    if (AssetGridPanel.currentPanel) {
      AssetGridPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return AssetGridPanel.currentPanel;
    }

    const workspaceRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri) ?? [];
    const panel = vscode.window.createWebviewPanel(
      "gameAssetExplorer.assetGrid",
      "Game Asset Explorer",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: workspaceRoots.length > 0 ? workspaceRoots : [options.extensionUri],
      },
    );

    AssetGridPanel.currentPanel = new AssetGridPanel(panel, options.onRefresh);
    return AssetGridPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, onRefresh: () => Promise<AssetRecord[]>) {
    this.panel = panel;
    this.onRefresh = onRefresh;

    this.panel.onDidDispose(() => {
      AssetGridPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRefreshMessage(message)) {
        return;
      }

      const assets = await this.onRefresh();
      this.update(assets);
    });
  }

  update(assets: readonly AssetRecord[]): void {
    this.assets = [...assets];
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets);
  }
}

function getWebviewHtml(webview: vscode.Webview, assets: readonly AssetRecord[]): string {
  const nonce = createNonce();
  const cards = assets.map((asset) => renderAssetCard(webview, asset)).join("\n");
  const body = assets.length === 0
    ? `<div class="empty"><strong>No image assets found.</strong><span>Configure <code>gameAssetExplorer.assetDirectories</code> and refresh.</span></div>`
    : `<div class="grid">${cards}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Game Asset Explorer</title>
  <style>
    body { margin: 0; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .summary { color: var(--vscode-descriptionForeground); }
    button { border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 6px 12px; border-radius: 2px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .card { min-width: 0; border: 1px solid var(--vscode-widget-border); background: var(--vscode-sideBar-background); border-radius: 6px; overflow: hidden; }
    .preview { display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); }
    .preview img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .broken { display: none; color: var(--vscode-descriptionForeground); text-align: center; padding: 12px; }
    .meta { padding: 8px 10px 10px; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .path { margin-top: 4px; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    .empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-descriptionForeground); text-align: center; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="summary">${assets.length} image asset${assets.length === 1 ? "" : "s"}</div>
    <button id="refresh" type="button">Refresh</button>
  </div>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.querySelectorAll('img[data-fallback]').forEach((image) => {
      image.addEventListener('error', () => {
        image.style.display = 'none';
        const fallback = image.parentElement.querySelector('.broken');
        if (fallback) fallback.style.display = 'block';
      });
    });
  </script>
</body>
</html>`;
}

function renderAssetCard(webview: vscode.Webview, asset: AssetRecord): string {
  const imageUri = webview.asWebviewUri(vscode.Uri.file(asset.absolutePath));
  const filename = path.basename(asset.relativePath);
  return `<article class="card">
    <div class="preview">
      <img data-fallback src="${escapeHtml(imageUri.toString())}" alt="${escapeHtml(filename)}">
      <div class="broken">Preview unavailable</div>
    </div>
    <div class="meta">
      <div class="name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</div>
      <div class="path">${escapeHtml(asset.relativePath)}</div>
    </div>
  </article>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}

function isRefreshMessage(message: unknown): message is { type: "refresh" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "refresh";
}
