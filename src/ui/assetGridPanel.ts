import * as vscode from "vscode";
import {
  buildAssetFacetOptions,
  filterWorkspaceAssetsByFacets,
  reconcileAssetFacetSelection,
  type AssetFacetOption,
  type AssetFacetSelection,
} from "../assetFacets";
import { type AssetHealthReport, type MissingAssetReference } from "../assetHealthSearch";
import { AssetDetails } from "../core/assetDetails";
import { type AssetFileType } from "../core/assetScanner";
import { createExplorationState, reconcileExplorationState, type ExplorationState } from "../explorationState";
import { AssetUsage } from "../usageSearch";
import { type VariantRequestInput } from "../variantRequest";
import { type VariantReviewView } from "../variantReviewController";
import {
  isRejectVariantMessage,
  parseApproveVariantMessage,
  parseStartVariantMessage,
} from "../variantUiMessages";
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
  onFindUsages: (identity: string) => Promise<AssetUsage[]>;
  onCheckHealth: (identity: string) => Promise<AssetHealthReport | undefined>;
  onStartVariant: (identity: string, input: VariantRequestInput) => Promise<VariantReviewView>;
  onApproveVariant: (candidateId: string) => Promise<WorkspaceAsset[]>;
  onRejectVariant: () => Promise<void>;
  onOpenUsage: (usage: AssetUsage) => Promise<void>;
}

export class AssetGridPanel {
  private static currentPanel: AssetGridPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly onRefresh: () => Promise<WorkspaceAsset[]>;
  private readonly onSearch: (query: string) => WorkspaceAsset[];
  private readonly onSelect: (identity: string) => Promise<AssetSelectionResult>;
  private readonly onCopyPath: (identity: string) => Promise<boolean>;
  private readonly onFindUsages: (identity: string) => Promise<AssetUsage[]>;
  private readonly onCheckHealth: (identity: string) => Promise<AssetHealthReport | undefined>;
  private readonly onStartVariant: (identity: string, input: VariantRequestInput) => Promise<VariantReviewView>;
  private readonly onApproveVariant: (candidateId: string) => Promise<WorkspaceAsset[]>;
  private readonly onRejectVariant: () => Promise<void>;
  private readonly onOpenUsage: (usage: AssetUsage) => Promise<void>;
  private assets: WorkspaceAsset[] = [];
  private usageResults: AssetUsage[] = [];
  private healthResults: MissingAssetReference[] = [];
  private variantReview: VariantReviewView | undefined;
  private variantReviewIdentity: string | undefined;
  private viewState: ExplorationState = createExplorationState();
  private facets: AssetFacetSelection = {};
  private disposed = false;

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

    AssetGridPanel.currentPanel = new AssetGridPanel(panel, options);
    return AssetGridPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, options: AssetGridPanelOptions) {
    this.panel = panel;
    this.onRefresh = options.onRefresh;
    this.onSearch = options.onSearch;
    this.onSelect = options.onSelect;
    this.onCopyPath = options.onCopyPath;
    this.onFindUsages = options.onFindUsages;
    this.onCheckHealth = options.onCheckHealth;
    this.onStartVariant = options.onStartVariant;
    this.onApproveVariant = options.onApproveVariant;
    this.onRejectVariant = options.onRejectVariant;
    this.onOpenUsage = options.onOpenUsage;

    this.panel.onDidDispose(() => {
      this.disposed = true;
      AssetGridPanel.currentPanel = undefined;
      this.clearVariantReview();
      void this.onRejectVariant().catch((error) => {
        console.warn("Game Asset Explorer: Unable to discard transient Generate Variant state.", error);
      });
    });

    this.panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (isReadyMessage(message)) {
        await this.restoreViewState();
        return;
      }

      if (isRefreshMessage(message)) {
        const assets = await this.onRefresh();
        this.update(assets);
        return;
      }

      if (isFilterMessage(message)) {
        this.viewState = { ...this.viewState, query: message.query };
        this.facets = reconcileAssetFacetSelection(message.facets, this.assets);
        await this.postFilterResults(message.query);
        return;
      }

      if (isScrollMessage(message)) {
        this.viewState = { ...this.viewState, scrollY: message.scrollY };
        return;
      }

      if (isSelectMessage(message)) {
        if (this.variantReview && this.variantReviewIdentity !== message.identity) {
          await this.rejectActiveVariant();
        }
        this.viewState = { ...this.viewState, selectedIdentity: message.identity };
        this.usageResults = [];
        this.healthResults = [];
        const result = await this.onSelect(message.identity);
        if (this.viewState.selectedIdentity !== message.identity || this.disposed) {
          return;
        }
        await this.panel.webview.postMessage({ type: "assetDetails", result });
        if (this.variantReview && this.variantReviewIdentity === message.identity) {
          await this.panel.webview.postMessage({ type: "variantReviewResult", review: this.variantReview });
        }
        return;
      }

      if (isCopyPathMessage(message)) {
        const copied = await this.onCopyPath(message.identity);
        await this.panel.webview.postMessage({ type: "copyPathResult", copied });
        return;
      }

      if (isFindUsagesMessage(message)) {
        const usages = await this.onFindUsages(message.identity);
        if (this.viewState.selectedIdentity !== message.identity || this.disposed) {
          return;
        }
        this.usageResults = usages;
        await this.panel.webview.postMessage({ type: "findUsagesResult", usages: this.usageResults });
        return;
      }

      if (isCheckHealthMessage(message)) {
        const report = await this.onCheckHealth(message.identity);
        if (this.viewState.selectedIdentity !== message.identity || this.disposed) {
          return;
        }
        this.healthResults = report?.missingReferences ?? [];
        await this.panel.webview.postMessage({ type: "assetHealthResult", report });
        return;
      }

      const startVariant = parseStartVariantMessage(message);
      if (startVariant) {
        if (this.viewState.selectedIdentity !== startVariant.identity) {
          await this.postVariantError("Selected asset changed before generation started.");
          return;
        }
        try {
          const review = await this.onStartVariant(startVariant.identity, startVariant.input);
          if (this.disposed || this.viewState.selectedIdentity !== startVariant.identity) {
            await this.onRejectVariant();
            this.clearVariantReview();
            if (!this.disposed) {
              await this.postVariantError("Selected asset changed while generation was running; generated candidates were discarded.");
            }
            return;
          }
          this.variantReview = review;
          this.variantReviewIdentity = startVariant.identity;
          await this.panel.webview.postMessage({ type: "variantReviewResult", review });
        } catch (error) {
          await this.postVariantError(formatError(error));
        }
        return;
      }

      const approveVariant = parseApproveVariantMessage(message);
      if (approveVariant) {
        if (!this.variantReview) {
          await this.postVariantError("No active Generate Variant review is available.");
          return;
        }
        try {
          const assets = await this.onApproveVariant(approveVariant.candidateId);
          this.clearVariantReview();
          if (!this.disposed) {
            this.update(assets);
          }
        } catch (error) {
          await this.postVariantError(formatError(error));
        }
        return;
      }

      if (isRejectVariantMessage(message)) {
        try {
          await this.rejectActiveVariant();
          if (!this.disposed) {
            await this.panel.webview.postMessage({ type: "variantRejected" });
          }
        } catch (error) {
          await this.postVariantError(formatError(error));
        }
        return;
      }

      if (isOpenUsageMessage(message)) {
        const usage = this.usageResults[message.index];
        if (usage) {
          await this.onOpenUsage(usage);
        }
        return;
      }

      if (isOpenHealthResultMessage(message)) {
        const finding = this.healthResults[message.index];
        if (finding) {
          await this.onOpenUsage(finding);
        }
      }
    });
  }

  update(assets: readonly WorkspaceAsset[]): void {
    if (this.disposed) {
      return;
    }
    this.assets = [...assets];
    this.facets = reconcileAssetFacetSelection(this.facets, this.assets);
    const state = reconcileExplorationState(this.viewState, this.assets);
    this.viewState = {
      query: state.query,
      selectedIdentity: state.selectedIdentity,
      scrollY: state.scrollY,
    };
    this.healthResults = [];
    if (state.selectionStatus === "missing") {
      this.usageResults = [];
      if (this.variantReview) {
        this.clearVariantReview();
        void this.onRejectVariant().catch((error) => {
          console.warn("Game Asset Explorer: Unable to discard review for missing asset.", error);
        });
      }
    }
    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.assets);
  }

  private async postFilterResults(query: string): Promise<void> {
    const searchMatches = this.onSearch(query);
    const matches = filterWorkspaceAssetsByFacets(searchMatches, "", this.facets);
    await this.panel.webview.postMessage({
      type: "filterResults",
      identities: matches.map(getWorkspaceAssetIdentity),
      count: matches.length,
      total: this.assets.length,
      facets: this.facets,
    });
  }

  private async restoreViewState(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const state = reconcileExplorationState(this.viewState, this.assets);
    this.viewState = {
      query: state.query,
      selectedIdentity: state.selectedIdentity,
      scrollY: state.scrollY,
    };
    this.facets = reconcileAssetFacetSelection(this.facets, this.assets);
    this.healthResults = [];
    if (state.selectionStatus === "missing") {
      this.usageResults = [];
    }

    const searchMatches = this.onSearch(state.query);
    const matches = filterWorkspaceAssetsByFacets(searchMatches, "", this.facets);
    await this.panel.webview.postMessage({
      type: "restoreState",
      query: state.query,
      selectedIdentity: state.selectedIdentity,
      scrollY: state.scrollY,
      identities: matches.map(getWorkspaceAssetIdentity),
      count: matches.length,
      total: this.assets.length,
      facets: this.facets,
    });

    if (!state.selectedIdentity) {
      return;
    }

    const restoringIdentity = state.selectedIdentity;
    const result = await this.onSelect(restoringIdentity);
    if (this.viewState.selectedIdentity !== restoringIdentity || this.disposed) {
      return;
    }
    if (result.status !== "available") {
      this.usageResults = [];
    }
    await this.panel.webview.postMessage({ type: "assetDetails", result });
    if (result.status === "available" && this.usageResults.length > 0) {
      await this.panel.webview.postMessage({ type: "findUsagesResult", usages: this.usageResults });
    }
    if (result.status === "available" && this.variantReview && this.variantReviewIdentity === restoringIdentity) {
      await this.panel.webview.postMessage({ type: "variantReviewResult", review: this.variantReview });
    }
  }

  private async rejectActiveVariant(): Promise<void> {
    if (!this.variantReview) {
      return;
    }
    await this.onRejectVariant();
    this.clearVariantReview();
  }

  private clearVariantReview(): void {
    this.variantReview = undefined;
    this.variantReviewIdentity = undefined;
  }

  private async postVariantError(message: string): Promise<void> {
    if (!this.disposed) {
      await this.panel.webview.postMessage({ type: "variantError", message });
    }
  }
}

function getWebviewHtml(webview: vscode.Webview, assets: readonly WorkspaceAsset[]): string {
  const nonce = createNonce();
  const cards = assets.map((asset) => renderAssetCard(webview, asset)).join("\n");
  const facetOptions = buildAssetFacetOptions(assets);
  const workspaceFacet = facetOptions.workspaces.length > 1
    ? renderFacetSelect("workspace-filter", "Workspace", facetOptions.workspaces)
    : "";
  const body = assets.length === 0
    ? `<div class="empty"><strong>No image assets found.</strong><span>Configure <code>gameAssetExplorer.assetDirectories</code> and refresh.</span></div>`
    : `<div class="content"><div class="grid">${cards}</div><aside id="details" class="details" hidden></aside></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Game Asset Explorer</title>
  <style>
    body { margin: 0; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .search { flex: 1; min-width: 120px; max-width: 520px; border: 1px solid var(--vscode-input-border, transparent); color: var(--vscode-input-foreground); background: var(--vscode-input-background); padding: 6px 8px; outline: none; }
    .search:focus, .facet-select:focus, .variant-control:focus { border-color: var(--vscode-focusBorder); }
    .summary { margin-left: auto; color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .facets { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .facet-label { display: flex; align-items: center; gap: 5px; color: var(--vscode-descriptionForeground); font-size: 0.82em; }
    .facet-select { max-width: 230px; min-width: 105px; border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent)); color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground)); background: var(--vscode-dropdown-background, var(--vscode-input-background)); padding: 4px 24px 4px 6px; outline: none; }
    .filter-status { color: var(--vscode-descriptionForeground); font-size: 0.82em; white-space: nowrap; }
    button { border: 1px solid var(--vscode-button-border, transparent); color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 6px 12px; border-radius: 2px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.compact { padding: 4px 8px; font-size: 0.82em; }
    button:disabled { opacity: 0.55; cursor: default; }
    .content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: 18px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 14px; align-items: start; }
    .card { min-width: 0; border: 1px solid var(--vscode-widget-border); background: var(--vscode-sideBar-background); border-radius: 6px; overflow: hidden; cursor: pointer; transition: background-color 80ms ease, border-color 80ms ease, box-shadow 80ms ease; }
    .card:hover { background: var(--vscode-list-hoverBackground); }
    .card:focus { outline: none; }
    .card:focus-visible { border-color: var(--vscode-focusBorder); outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .card.selected { border-color: var(--vscode-focusBorder); box-shadow: inset 0 0 0 1px var(--vscode-focusBorder); background: var(--vscode-list-inactiveSelectionBackground); }
    .card[hidden] { display: none; }
    .preview { display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; padding: 8px; background: var(--vscode-editor-inactiveSelectionBackground); }
    .preview img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .broken { display: none; color: var(--vscode-descriptionForeground); text-align: center; padding: 12px; }
    .meta { padding: 9px 10px 10px; }
    .name { display: -webkit-box; min-height: 2.5em; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; font-weight: 600; line-height: 1.25; }
    .path { margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-descriptionForeground); font-size: 0.82em; }
    .details { position: sticky; top: 16px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 14px; background: var(--vscode-sideBar-background); }
    .details h2 { margin: 0 0 12px; font-size: 1.05rem; }
    .details h3 { margin: 16px 0 8px; font-size: 0.95rem; }
    .detail-row { margin: 10px 0; }
    .detail-label { display: block; color: var(--vscode-descriptionForeground); font-size: 0.8em; margin-bottom: 2px; }
    .detail-value { overflow-wrap: anywhere; }
    .details-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .status { margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    .missing { color: var(--vscode-errorForeground); }
    .health-result { margin-top: 10px; padding: 9px 10px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
    .health-result.warning { border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-widget-border)); background: var(--vscode-inputValidation-warningBackground, transparent); }
    .health-result.ok { border-color: var(--vscode-testing-iconPassed, var(--vscode-widget-border)); }
    .usage-list { display: flex; flex-direction: column; gap: 6px; }
    .usage { width: 100%; text-align: left; color: var(--vscode-foreground); background: var(--vscode-list-inactiveSelectionBackground); border-color: transparent; }
    .usage:hover { background: var(--vscode-list-hoverBackground); }
    .usage-path { display: block; overflow-wrap: anywhere; font-size: 0.9em; }
    .usage-location { display: block; margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 0.8em; }
    .variant-panel { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--vscode-widget-border); }
    .variant-form { display: grid; gap: 9px; margin-top: 10px; }
    .variant-label { display: grid; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 0.82em; }
    .variant-control { width: 100%; box-sizing: border-box; border: 1px solid var(--vscode-input-border, transparent); color: var(--vscode-input-foreground); background: var(--vscode-input-background); padding: 6px 8px; outline: none; font: inherit; }
    textarea.variant-control { min-height: 64px; resize: vertical; }
    .variant-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .variant-review { margin-top: 12px; }
    .variant-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 9px; }
    .variant-candidate { border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 7px; background: var(--vscode-editor-background); }
    .variant-candidate img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: contain; background: var(--vscode-editor-inactiveSelectionBackground); margin-bottom: 7px; }
    .variant-output { margin-bottom: 8px; overflow-wrap: anywhere; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    .empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--vscode-descriptionForeground); text-align: center; }
    @media (max-width: 900px) { .content { grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 14px; } .grid { grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); } }
    @media (max-width: 760px) { .content { grid-template-columns: 1fr; } .details { position: static; } }
    @media (max-width: 440px) { body { padding: 12px; } .toolbar { flex-wrap: wrap; gap: 8px; } .search { order: 1; flex-basis: 100%; max-width: none; } .summary { margin-left: 0; } .facet-label { flex: 1 1 100%; } .facet-select { flex: 1; max-width: none; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="search" class="search" type="search" placeholder="Search filename or path" aria-label="Search assets">
    <div id="summary" class="summary">${assets.length} image asset${assets.length === 1 ? "" : "s"}</div>
    <button id="refresh" type="button">Refresh</button>
  </div>
  <div class="facets" aria-label="Asset filters">
    ${renderFacetSelect("folder-filter", "Folder", facetOptions.folders)}
    ${renderFacetSelect("type-filter", "Type", facetOptions.fileTypes)}
    ${workspaceFacet}
    <button id="clear-filters" class="secondary compact" type="button">Clear filters</button>
    <span id="filter-status" class="filter-status">No facet filters</span>
  </div>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const search = document.getElementById('search');
    const summary = document.getElementById('summary');
    const details = document.getElementById('details');
    const folderFilter = document.getElementById('folder-filter');
    const typeFilter = document.getElementById('type-filter');
    const workspaceFilter = document.getElementById('workspace-filter');
    const clearFilters = document.getElementById('clear-filters');
    const filterStatus = document.getElementById('filter-status');
    let selectedIdentity = null;
    let scrollFramePending = false;

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    search.addEventListener('input', sendFilter);
    [folderFilter, typeFilter, workspaceFilter].filter(Boolean).forEach((control) => control.addEventListener('change', sendFilter));
    clearFilters.addEventListener('click', () => {
      if (folderFilter) folderFilter.value = '';
      if (typeFilter) typeFilter.value = '';
      if (workspaceFilter) workspaceFilter.value = '';
      sendFilter();
    });
    window.addEventListener('scroll', () => {
      if (scrollFramePending) return;
      scrollFramePending = true;
      requestAnimationFrame(() => {
        scrollFramePending = false;
        vscode.postMessage({ type: 'scroll', scrollY: window.scrollY });
      });
    }, { passive: true });

    document.querySelectorAll('.card[data-asset-key]').forEach((card) => {
      const select = () => {
        selectedIdentity = card.dataset.assetKey;
        setSelectedCard(card);
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

      if (message.type === 'restoreState') {
        search.value = typeof message.query === 'string' ? message.query : '';
        selectedIdentity = typeof message.selectedIdentity === 'string' ? message.selectedIdentity : null;
        applyFacetState(message.facets || {});
        applyFilterResults(message.identities || [], message.count || 0, message.total || 0);
        let selectedCard = null;
        document.querySelectorAll('.card[data-asset-key]').forEach((card) => {
          if (card.dataset.assetKey === selectedIdentity) selectedCard = card;
        });
        setSelectedCard(selectedCard);
        const scrollY = Number.isFinite(message.scrollY) && message.scrollY > 0 ? message.scrollY : 0;
        requestAnimationFrame(() => window.scrollTo(0, scrollY));
        return;
      }

      if (message.type === 'filterResults') {
        applyFacetState(message.facets || {});
        applyFilterResults(message.identities || [], message.count || 0, message.total || 0);
        return;
      }

      if (message.type === 'assetDetails') {
        renderDetails(message.result);
        return;
      }

      if (message.type === 'copyPathResult') {
        const status = document.getElementById('copy-status');
        if (status) status.textContent = message.copied ? 'Path copied.' : 'Asset is no longer available.';
        return;
      }

      if (message.type === 'findUsagesResult') {
        renderUsages(message.usages || []);
        return;
      }

      if (message.type === 'assetHealthResult') {
        renderHealth(message.report);
        return;
      }

      if (message.type === 'variantReviewResult') {
        renderVariantReview(message.review);
        return;
      }

      if (message.type === 'variantError') {
        setVariantBusy(false);
        const status = document.getElementById('variant-status');
        if (status) status.textContent = message.message || 'Generate Variant failed.';
        return;
      }

      if (message.type === 'variantRejected') {
        setVariantBusy(false);
        renderVariantReview(null);
        const status = document.getElementById('variant-status');
        if (status) status.textContent = 'Candidates rejected. No project asset was written.';
      }
    });

    function currentFacets() {
      return {
        folder: folderFilter && folderFilter.value ? folderFilter.value : undefined,
        fileType: typeFilter && typeFilter.value ? typeFilter.value : undefined,
        workspaceFolderUri: workspaceFilter && workspaceFilter.value ? workspaceFilter.value : undefined,
      };
    }

    function sendFilter() {
      vscode.postMessage({ type: 'filter', query: search.value, facets: currentFacets() });
      updateFilterStatus();
    }

    function applyFacetState(facets) {
      if (folderFilter) folderFilter.value = facets.folder || '';
      if (typeFilter) typeFilter.value = facets.fileType || '';
      if (workspaceFilter) workspaceFilter.value = facets.workspaceFolderUri || '';
      updateFilterStatus();
    }

    function updateFilterStatus() {
      const facets = currentFacets();
      const count = [facets.folder, facets.fileType, facets.workspaceFolderUri].filter(Boolean).length;
      filterStatus.textContent = count === 0 ? 'No facet filters' : count + ' active filter' + (count === 1 ? '' : 's');
      clearFilters.disabled = count === 0;
    }

    function applyFilterResults(identities, count, total) {
      const visibleIdentities = new Set(identities);
      document.querySelectorAll('.card[data-asset-key]').forEach((card) => {
        card.hidden = !visibleIdentities.has(card.dataset.assetKey);
      });
      summary.textContent = count === total
        ? total + ' image asset' + (total === 1 ? '' : 's')
        : count + ' of ' + total + ' image assets';
    }

    function setSelectedCard(selectedCard) {
      document.querySelectorAll('.card[data-asset-key]').forEach((card) => {
        const isSelected = card === selectedCard;
        card.classList.toggle('selected', isSelected);
        if (isSelected) card.setAttribute('aria-current', 'true');
        else card.removeAttribute('aria-current');
      });
    }

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

      const copyButton = actionButton('Copy Asset Path', false, () => {
        if (selectedIdentity) vscode.postMessage({ type: 'copyPath', identity: selectedIdentity });
      });
      const usagesButton = actionButton('Find Usages', true, () => {
        if (!selectedIdentity) return;
        const status = document.getElementById('usage-status');
        if (status) status.textContent = 'Searching workspace…';
        vscode.postMessage({ type: 'findUsages', identity: selectedIdentity });
      });
      const healthButton = actionButton('Check Asset Health', true, () => {
        if (!selectedIdentity) return;
        const status = document.getElementById('health-status');
        if (status) status.textContent = 'Checking direct workspace references…';
        vscode.postMessage({ type: 'checkHealth', identity: selectedIdentity });
      });
      const variantButton = actionButton('Generate Variant', false, () => {
        const form = document.getElementById('variant-form');
        if (form) form.hidden = !form.hidden;
      });

      actions.append(copyButton, usagesButton, healthButton, variantButton);
      details.appendChild(actions);

      const copyStatus = statusNode('copy-status');
      const usageStatus = statusNode('usage-status');
      const usageContainer = document.createElement('div');
      usageContainer.id = 'usages';
      const healthStatus = statusNode('health-status');
      const healthContainer = document.createElement('div');
      healthContainer.id = 'health';
      details.append(copyStatus, usageStatus, usageContainer, healthStatus, healthContainer);
      details.appendChild(createVariantPanel());
    }

    function createVariantPanel() {
      const panel = document.createElement('section');
      panel.className = 'variant-panel';

      const form = document.createElement('div');
      form.id = 'variant-form';
      form.className = 'variant-form';
      form.hidden = true;

      const preset = selectControl('Intent', 'variant-preset', [
        ['pose-action', 'Different pose / action'],
        ['damage-state', 'Damage state'],
        ['environment', 'Environment / time / weather'],
        ['custom', 'Custom intent'],
      ]);
      const request = textAreaControl('Request details (required for Custom)', 'variant-request', 'Describe the desired change while preserving the Approved Anchor.');
      const output = textControl('Output path (blank uses *_variant)', 'variant-output-path', '');
      const size = selectControl('Output size', 'variant-size', [
        ['1024x1024', '1024 × 1024'],
        ['1536x1024', '1536 × 1024'],
        ['1024x1536', '1024 × 1536'],
      ]);
      const format = selectControl('Output format', 'variant-format', [
        ['', 'Same as source (GIF → PNG)'],
        ['png', 'PNG'],
        ['jpeg', 'JPEG'],
        ['webp', 'WebP'],
      ]);

      const buttons = document.createElement('div');
      buttons.className = 'variant-actions';
      const start = actionButton('Generate 3 Candidates', false, () => {
        if (!selectedIdentity) return;
        setVariantBusy(true);
        const status = document.getElementById('variant-status');
        if (status) status.textContent = 'Generating candidates from the selected Approved Anchor…';
        const presetValue = document.getElementById('variant-preset').value;
        const customRequest = document.getElementById('variant-request').value;
        const outputPath = document.getElementById('variant-output-path').value;
        const outputSize = document.getElementById('variant-size').value;
        const outputFormat = document.getElementById('variant-format').value;
        vscode.postMessage({
          type: 'startVariant',
          identity: selectedIdentity,
          input: {
            preset: presetValue,
            ...(customRequest ? { customRequest } : {}),
            ...(outputPath ? { outputPath } : {}),
            outputSize,
            ...(outputFormat ? { outputFormat } : {}),
          },
        });
      });
      start.id = 'variant-start';
      buttons.appendChild(start);

      form.append(preset, request, output, size, format, buttons);
      panel.appendChild(form);
      panel.appendChild(statusNode('variant-status'));
      const review = document.createElement('div');
      review.id = 'variant-review';
      panel.appendChild(review);
      return panel;
    }

    function renderVariantReview(review) {
      const container = document.getElementById('variant-review');
      if (!container) return;
      container.replaceChildren();
      if (!review || !Array.isArray(review.candidates)) return;

      setVariantBusy(false);
      const status = document.getElementById('variant-status');
      if (status) status.textContent = 'Review candidates. Nothing is written until you approve one.';

      const wrapper = document.createElement('div');
      wrapper.className = 'variant-review';
      const output = document.createElement('div');
      output.className = 'variant-output';
      output.textContent = 'Approval target: ' + review.outputPath;
      wrapper.appendChild(output);

      const grid = document.createElement('div');
      grid.className = 'variant-grid';
      review.candidates.forEach((candidate, index) => {
        const card = document.createElement('div');
        card.className = 'variant-candidate';
        const image = document.createElement('img');
        image.src = candidate.dataUri;
        image.alt = 'Generated candidate ' + (index + 1);
        const approve = actionButton('Approve ' + (index + 1), false, () => {
          setVariantBusy(true);
          const status = document.getElementById('variant-status');
          if (status) status.textContent = 'Approving candidate and writing ' + review.outputPath + '…';
          vscode.postMessage({ type: 'approveVariant', candidateId: candidate.id });
        });
        card.append(image, approve);
        grid.appendChild(card);
      });
      wrapper.appendChild(grid);

      const actions = document.createElement('div');
      actions.className = 'variant-actions';
      actions.style.marginTop = '9px';
      const reject = actionButton('Reject All', true, () => {
        setVariantBusy(true);
        vscode.postMessage({ type: 'rejectVariant' });
      });
      actions.appendChild(reject);
      wrapper.appendChild(actions);
      container.appendChild(wrapper);
    }

    function setVariantBusy(busy) {
      const start = document.getElementById('variant-start');
      if (start) start.disabled = busy;
      document.querySelectorAll('#variant-review button').forEach((button) => { button.disabled = busy; });
    }

    function selectControl(label, id, options) {
      const wrapper = document.createElement('label');
      wrapper.className = 'variant-label';
      wrapper.textContent = label;
      const select = document.createElement('select');
      select.id = id;
      select.className = 'variant-control';
      options.forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
      });
      wrapper.appendChild(select);
      return wrapper;
    }

    function textControl(label, id, placeholder) {
      const wrapper = document.createElement('label');
      wrapper.className = 'variant-label';
      wrapper.textContent = label;
      const input = document.createElement('input');
      input.id = id;
      input.className = 'variant-control';
      input.type = 'text';
      input.placeholder = placeholder;
      wrapper.appendChild(input);
      return wrapper;
    }

    function textAreaControl(label, id, placeholder) {
      const wrapper = document.createElement('label');
      wrapper.className = 'variant-label';
      wrapper.textContent = label;
      const input = document.createElement('textarea');
      input.id = id;
      input.className = 'variant-control';
      input.placeholder = placeholder;
      wrapper.appendChild(input);
      return wrapper;
    }

    function actionButton(label, secondary, handler) {
      const button = document.createElement('button');
      button.type = 'button';
      if (secondary) button.className = 'secondary';
      button.textContent = label;
      button.addEventListener('click', handler);
      return button;
    }

    function statusNode(id) {
      const node = document.createElement('div');
      node.id = id;
      node.className = 'status';
      return node;
    }

    function renderUsages(usages) {
      const container = document.getElementById('usages');
      const status = document.getElementById('usage-status');
      if (!container || !status) return;

      container.replaceChildren();
      status.textContent = usages.length === 0
        ? 'No text usages found in this workspace.'
        : usages.length + ' usage' + (usages.length === 1 ? '' : 's') + ' found.';
      if (usages.length === 0) return;

      const heading = document.createElement('h3');
      heading.textContent = 'Usages';
      const list = document.createElement('div');
      list.className = 'usage-list';
      usages.forEach((usage, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'usage';
        const pathNode = document.createElement('span');
        pathNode.className = 'usage-path';
        pathNode.textContent = usage.sourcePath;
        const location = document.createElement('span');
        location.className = 'usage-location';
        location.textContent = 'Line ' + (usage.line + 1) + ', column ' + (usage.character + 1) + ' · ' + usage.matchedText;
        button.append(pathNode, location);
        button.addEventListener('click', () => vscode.postMessage({ type: 'openUsage', index }));
        list.appendChild(button);
      });
      container.append(heading, list);
    }

    function renderHealth(report) {
      const container = document.getElementById('health');
      const status = document.getElementById('health-status');
      if (!container || !status) return;

      container.replaceChildren();
      if (!report || !report.assetHealth) {
        status.textContent = 'Asset is no longer available.';
        return;
      }

      status.textContent = 'Asset Health uses direct static text evidence only; dynamic references may not be visible.';
      const summaryNode = document.createElement('div');
      const referenced = report.assetHealth.status === 'referenced';
      summaryNode.className = 'health-result ' + (referenced ? 'ok' : 'warning');
      summaryNode.textContent = referenced
        ? 'Referenced · ' + report.assetHealth.usageCount + ' direct path usage' + (report.assetHealth.usageCount === 1 ? '' : 's') + ' observed. Evidence: direct.'
        : 'Unused Candidate · no direct workspace-relative path usages observed. Evidence: candidate, not proof of being unused.';
      container.appendChild(summaryNode);

      const missingReferences = Array.isArray(report.missingReferences) ? report.missingReferences : [];
      const heading = document.createElement('h3');
      heading.textContent = 'Missing References';
      container.appendChild(heading);
      if (missingReferences.length === 0) {
        const none = document.createElement('div');
        none.className = 'status';
        none.textContent = 'No direct missing image references found in this workspace scan.';
        container.appendChild(none);
        return;
      }

      const list = document.createElement('div');
      list.className = 'usage-list';
      missingReferences.forEach((finding, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'usage';
        const target = document.createElement('span');
        target.className = 'usage-path';
        target.textContent = finding.targetPath + ' · Missing Reference';
        const location = document.createElement('span');
        location.className = 'usage-location';
        location.textContent = finding.sourcePath + ':' + (finding.line + 1) + ':' + (finding.character + 1) + ' · evidence: direct';
        button.append(target, location);
        button.addEventListener('click', () => vscode.postMessage({ type: 'openHealthResult', index }));
        list.appendChild(button);
      });
      container.appendChild(list);
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

    updateFilterStatus();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function renderFacetSelect(id: string, label: string, options: readonly AssetFacetOption[]): string {
  const renderedOptions = options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)} (${option.count})</option>`)
    .join("");
  return `<label class="facet-label">${escapeHtml(label)}<select id="${escapeHtml(id)}" class="facet-select" aria-label="Filter by ${escapeHtml(label.toLowerCase())}"><option value="">All</option>${renderedOptions}</select></label>`;
}

function renderAssetCard(webview: vscode.Webview, workspaceAsset: WorkspaceAsset): string {
  const asset = workspaceAsset.asset;
  const imageUri = webview.asWebviewUri(vscode.Uri.file(asset.absolutePath));
  const identity = getWorkspaceAssetIdentity(workspaceAsset);
  const displayPath = `${workspaceAsset.workspaceFolderName}: ${asset.relativePath}`;
  const accessibleLabel = `Show details for ${asset.fileName}, ${displayPath}`;
  return `<article class="card" tabindex="0" role="button" aria-label="${escapeHtml(accessibleLabel)}" data-asset-key="${escapeHtml(identity)}">
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

function isReadyMessage(message: unknown): message is { type: "ready" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "ready";
}

function isRefreshMessage(message: unknown): message is { type: "refresh" } {
  return typeof message === "object" && message !== null && "type" in message && message.type === "refresh";
}

function isFilterMessage(message: unknown): message is { type: "filter"; query: string; facets: AssetFacetSelection } {
  if (typeof message !== "object" || message === null || !("type" in message) || message.type !== "filter") {
    return false;
  }
  if (!("query" in message) || typeof message.query !== "string" || !("facets" in message)) {
    return false;
  }
  return isAssetFacetSelection(message.facets);
}

function isAssetFacetSelection(value: unknown): value is AssetFacetSelection {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const facet = value as { folder?: unknown; fileType?: unknown; workspaceFolderUri?: unknown };
  return isOptionalString(facet.folder)
    && (facet.fileType === undefined || isAssetFileType(facet.fileType))
    && isOptionalString(facet.workspaceFolderUri);
}

function isAssetFileType(value: unknown): value is AssetFileType {
  return value === "png" || value === "jpg" || value === "jpeg" || value === "webp" || value === "gif";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isScrollMessage(message: unknown): message is { type: "scroll"; scrollY: number } {
  return typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === "scroll"
    && "scrollY" in message
    && typeof message.scrollY === "number"
    && Number.isFinite(message.scrollY)
    && message.scrollY >= 0;
}

function isSelectMessage(message: unknown): message is { type: "select"; identity: string } {
  return isIdentityMessage(message, "select");
}

function isCopyPathMessage(message: unknown): message is { type: "copyPath"; identity: string } {
  return isIdentityMessage(message, "copyPath");
}

function isFindUsagesMessage(message: unknown): message is { type: "findUsages"; identity: string } {
  return isIdentityMessage(message, "findUsages");
}

function isCheckHealthMessage(message: unknown): message is { type: "checkHealth"; identity: string } {
  return isIdentityMessage(message, "checkHealth");
}

function isOpenUsageMessage(message: unknown): message is { type: "openUsage"; index: number } {
  return isIndexMessage(message, "openUsage");
}

function isOpenHealthResultMessage(message: unknown): message is { type: "openHealthResult"; index: number } {
  return isIndexMessage(message, "openHealthResult");
}

function isIndexMessage(message: unknown, type: string): message is { type: string; index: number } {
  return typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === type
    && "index" in message
    && typeof message.index === "number"
    && Number.isInteger(message.index)
    && message.index >= 0;
}

function isIdentityMessage(message: unknown, type: string): message is { type: string; identity: string } {
  return typeof message === "object"
    && message !== null
    && "type" in message
    && message.type === type
    && "identity" in message
    && typeof message.identity === "string";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
