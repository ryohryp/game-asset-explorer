import * as vscode from "vscode";
import { type AssetProfile } from "../core/assetProfiles";
import { type WorkspaceAsset } from "../workspaceAsset";
import {
  AssetGridPanel as BaseAssetGridPanel,
  type AssetGridPanelOptions,
} from "./assetGridPanelBase";
import { localizeAssetGridHtml } from "./assetGridHtmlLocalization";
import { createAssetGridUiStrings } from "./localization";

export type { AssetGridPanelOptions, AssetSelectionResult } from "./assetGridPanelBase";
export type AssetGridPanel = BaseAssetGridPanel;

const localizedPanels = new WeakSet<BaseAssetGridPanel>();

/**
 * Keeps localization outside the existing Asset Grid behavior. The base panel remains
 * authoritative for filtering, selection, metadata updates, and message handling;
 * this module only localizes the generated presentation after each render.
 */
export const AssetGridPanel = {
  show(options: AssetGridPanelOptions): BaseAssetGridPanel {
    const panel = BaseAssetGridPanel.show(options);
    installLocalization(panel);
    return panel;
  },
};

function installLocalization(panel: BaseAssetGridPanel): void {
  if (localizedPanels.has(panel)) {
    return;
  }
  localizedPanels.add(panel);

  const originalUpdate = panel.update.bind(panel);
  panel.update = (assets: readonly WorkspaceAsset[], assetProfile?: AssetProfile): void => {
    originalUpdate(assets, assetProfile);
    localizeRenderedHtml(panel);
  };
}

function localizeRenderedHtml(panel: BaseAssetGridPanel): void {
  const internal = panel as unknown as { panel: vscode.WebviewPanel };
  const strings = createAssetGridUiStrings((message) => vscode.l10n.t(message));
  internal.panel.webview.html = localizeAssetGridHtml(
    internal.panel.webview.html,
    strings,
    vscode.env.language,
  );
}
