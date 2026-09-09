import * as vscode from "vscode";
import { AssetDetails } from "../core/assetDetails";
import { getWorkspaceAssetIdentity, WorkspaceAsset } from "../workspaceAsset";

export type AssetSelectionResult =
  | { status: "available"; workspaceAsset: WorkspaceAsset; details: AssetDetails }
  | { status: "missing"; workspaceAsset?: WorkspaceAsset };

export interface AssetGridPanelOptions {
  extensionUri: vscode.Uri;
  onRefresh: () => Promise<WorkspaceAsset[]>;
  onSearch: (query: string) => WorkspaceAsset[];
  onSelect: (identity: string) => Promise<AssetSelectionResult>;
  onCopyPath: (identity: string) => Promise<boolean>;
}

export class AssetGridPanel {
  private static currentPanel: AssetGridPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly onRefresh: () => Promise<WorkspaceAsset[]>;
  private readonly onSearch: (query: string) => WorkspaceAsset[];
  private readonly onSelect: (identity: string) => Promise<AssetSelectionResult>;
  private readonly onCopyPath: (identity: string) => Promise<boolean>;
  private assets: WorkspaceAsset[] = [];

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

    AssetGridPanel.currentPanel = new AssetGridPanel(
      panel,
      options.onRefresh,
      options.onSearch,
      options.onSelect,
      options.onCopyPath,
    );
    return AssetGridPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    onRefresh: () => Promise<WorkspaceAsset[]>,
    onSearch: (query: string) => WorkspaceAsset[],
    onSelect: (identity: string) => Promise<AssetSelectionResult>,
    onCopyPath: (identity: string) => Promise<boolean>,
  ) {
    this.panel = panel;
    this.onRefresh = onRefresh;
    this.onSearch = onSearch;
    this.onSelect = onSelect;
    this.onCopyPath = onCopyPath;

    this.panel.onDidDispose(() => {
      AssetGridPanel.currentPanel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (isRefreshMessage(message)) {
        const assets = await this.onRefresh();
        this.update(assets);
        return;
      }

      if (isSearchMessage(message)) {
        const matches = this.onSearch(message.query);
        await this.panel.webview.postMessage({
          type: "searchResults",
          identities: matches.map(getWorkspaceAssetIdentity),
          count: matches.length,
          total: this.assets.length,
        });
        return;
      }

      if (isSelectMessage(message)) {
        const result = await this.onSelect(message.identity);
        await this.panel.webview.postMessage({ type: "assetDetails", result });
        return;
      }

      if (isCopyPathMessage(message)) {
        const copied = await this.onCopyPath(message.identity);
        await this.panel.webview.postMessage({ type: "copyPathResult", copied });
      }
    });
  }

  update(assets: readonly WorkspaceAsset[]): void {
    this.assets = [...assets];
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets);
  }
}

function getWebviewHtml(webview: vscode.Webview, assets: readonly WorkspaceAsset[]): string {
  const nonce = createNonce();
  const cards = assets.map((asset) => renderAssetCard(webview, asset)).join("\n");
  const body = assets.length === 0
    ? `<div class="empty"><strong>No image assets found.</strong><span>Configure <code>gameAssetExplorer.assetDirectories</code> and refresh.</span></div>`
    : `<div class="content"><div class="grid">${cards}</div><aside id="details" class="details" hidden></aside></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Game Asset Explorer</title>
  <style>
    body { margin: 0; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .search { flex: 1; min-width: 120px; max-width: 520px; border: 1px solid var(--vscode-input-border, transparent); color: var(--vscode-input-foreground); background: var(--vscode-input-background); padding: 6px 8px; outline: none; }
    .search:focus { border-color: var(--vscode-focusBorder); }
    .summary { margin-left: auto; color: var(--vscode-descriptionForeground); white-space: nowrap; }
    button { border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 6px 12px; border-radius: 2px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 300px); gap: 16px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .card { min-width: 0; border: 1px solid var(--vscode-widget-border); background: var(--vscode-sideBar-background); border-radius: 6px; overflow: hidden; cursor: pointer; }
    .card:hover, .card:focus { border-color: var(--vscode-focusBorder); outline: none; }
    .card[hidden] { display: none; }
    .preview { display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); }
    .preview img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .broken { display: none; color: var(--vscode-descriptionForeground); text-align: center; padding: 12px; }
    .meta { padding: 8px 10px 10px; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .path { margin-top: 4px; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    .details { position: sticky; top: 16px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 14px; background: var(--vscode-sideBar-background); }
    .details h2 { margin: 0 0 12px; font-size: 1.05rem; }
    .detail-row { margin: 10px 0; }
    .detail-label { display: block; color: var(--vscode-descriptionForeground); font-size: 0.8em; margin-bottom: 2px; }
    .detail-value { overflow-wrap: anywhere; }
    .details-actions { margin-top: 14px; }
    .status { margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    .missing { color: var(--vscode-errorForeground); }
    .empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-descriptionForeground); text-align: center; }
    @media (max-width: 760px) { .content { grid-template-columns: 1fr; } .details { position: static; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="search" class="search" type="search" placeholder="Search filename or path" aria-label="Search assets">
    <div id="summary" class="summary">${assets.length} image asset${assets.length === 1 ? "" : "s"}</div>
    <button id="refresh" type="button">Refresh</button>
  </div>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const search = document.getElementById('search');
    const summary = document.getElementById('summary');
    const details = document.getElementById('details');
    let selectedIdentity = null;

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    search.addEventListener('input', () => vscode.postMessage({ type: 'search', query: search.value }));

    document.querySelectorAll('.card[data-asset-key]').forEach((card) => {
      const select = () => {
        selectedIdentity = card.dataset.assetKey;
        vscode.postMessage({ type: 'select', identity: selectedIdentity });
      };
      card.addEventListener('click', select);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message) return;

      if (message.type === 'searchResults') {
        const identities = new Set(message.identities);
        document.querySelectorAll('.card[data-asset-key]').forEach((card) => {
          card.hidden = !identities.has(card.dataset.assetKey);
        });
        summary.textContent = message.count === message.total
          ? message.total + ' image asset' + (message.total === 1 ? '' : 's')
          : message.count + ' of ' + message.total + ' image assets';
        return;
      }

      if (message.type === 'assetDetails') {
        renderDetails(message.result);
        return;
      }

      if (message.type === 'copyPathResult') {
        const status = document.getElementById('copy-status');
        if (status) status.textContent = message.copied ? 'Path copied.' : 'Asset is no longer available.';
      }
    });

    function renderDetails(result) {
      if (!details) return;
      details.hidden = false;
      details.replaceChildren();

      if (!result || result.status !== 'available') {
        const heading = document.createElement('h2');
        heading.textContent = 'Asset unavailable';
        const message = document.createElement('div');
        message.className = 'missing';
        message.textContent = 'This asset no longer exists or is no longer in the current asset list. Refresh to rebuild from the filesystem.';
        details.append(heading, message);
        return;
      }

      const asset = result.workspaceAsset.asset;
      const heading = document.createElement('h2');
      heading.textContent = asset.fileName;
      details.appendChild(heading);
      addDetailRow('Path', asset.relativePath);
      addDetailRow('Workspace', result.workspaceAsset.workspaceFolderName);
      addDetailRow('Type', asset.fileType.toUpperCase());
      addDetailRow('Size', formatBytes(result.details.sizeBytes));
      addDetailRow('Modified', new Date(result.details.modifiedAt).toLocaleString());

      const actions = document.createElement('div');
      actions.className = 'details-actions';
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = 'Copy Asset Path';
      copyButton.addEventListener('click', () => {
        if (selectedIdentity) vscode.postMessage({ type: 'copyPath', identity: selectedIdentity });
      });
      const status = document.createElement('div');
      status.id = 'copy-status';
      status.className = 'status';
      actions.append(copyButton, status);
      details.appendChild(actions);
    }

    function addDetailRow(label, value) {
      const row = document.createElement('div');
      row.className = 'detail-row';
      const labelNode = document.createElement('span');
      labelNode.className = 'detail-label';
      labelNode.textContent = label;
      const valueNode = document.createElement('span');
      valueNode.className = 'detail-value';
      valueNode.textContent = value;
      row.append(labelNode, valueNode);
      details.appendChild(row);
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      const units = ['KB', 'MB', 'GB'];
      let value = bytes / 1024;
      let unit = units[0];
      for (let index = 1; index < units.length && value >= 1024; index += 1) {
        value /= 1024;
        unit = units[index];
      }
      return value.toFixed(value >= 10 ? 1 : 2) + ' ' + unit;
    }

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

function renderAssetCard(webview: vscode.Webview, workspaceAsset: WorkspaceAsset): string {
  const asset = workspaceAsset.asset;
  const imageUri = webview.asWebviewUri(vscode.Uri.file(asset.absolutePath));
  const identity = getWorkspaceAssetIdentity(workspaceAsset);
  const displayPath = `${workspaceAsset.workspaceFolderName}: ${asset.relativePath}`;
  return `<article class="card" tabindex="0" role="button" aria-label="Show details for ${escapeHtml(asset.fileName)}" data-asset-key="${escapeHtml(identity)}">
    <div class="preview">
      <img data-fallback src="${escapeHtml(imageUri.toString())}" alt="${escapeHtml(asset.fileName)}">
      <div class="broken">Preview unavailable</div>
    </div>
    <div class="meta">
      <div class="name" title="${escapeHtml(asset.fileName)}">${escapeHtml(asset.fileName)}</div>
      <div class="path" title="${escapeHtml(displayPath)}">${escapeHtml(displayPath)}</div>
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

function isSearchMessage(message: unknown): message is { type: "search"; query: string } {
  return typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === "search"
    && "query" in message
    && typeof message.query === "string";
}

function isSelectMessage(message: unknown): message is { type: "select"; identity: string } {
  return isIdentityMessage(message, "select");
}

function isCopyPathMessage(message: unknown): message is { type: "copyPath"; identity: string } {
  return isIdentityMessage(message, "copyPath");
}

function isIdentityMessage(message: unknown, type: string): message is { type: string; identity: string } {
  return typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === type
    && "identity" in message
    && typeof message.identity === "string";
}
