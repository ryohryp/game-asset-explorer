import * as vscode from "vscode";
import { updateConfiguredAssetProfile } from "../assetProfileConfiguration";
import { type AssetProfile } from "../core/assetProfiles";
import { type WorkspaceAsset } from "../workspaceAsset";
import {
  AssetGridPanel as BaseAssetGridPanel,
  type AssetGridPanelOptions,
} from "./assetGridPanelBase";
import { localizeAssetGridHtml } from "./assetGridHtmlLocalization";
import {
  injectAssetProfileSelector,
  parseSetAssetProfileMessage,
} from "./assetProfileSelector";
import { createAssetGridUiStrings } from "./localization";

export type { AssetGridPanelOptions, AssetSelectionResult } from "./assetGridPanelBase";
export type AssetGridPanel = BaseAssetGridPanel;

const enhancedPanels = new WeakSet<BaseAssetGridPanel>();

/**
 * Keeps presentation-only enhancements outside the existing Asset Grid behavior. The base
 * panel remains authoritative for filtering, selection, metadata updates, and messages.
 * This wrapper localizes each render and exposes the existing Asset Profile setting as a
 * compact selector without creating another source of truth.
 */
export const AssetGridPanel = {
  show(options: AssetGridPanelOptions): BaseAssetGridPanel {
    const panel = BaseAssetGridPanel.show(options);
    installEnhancements(panel);
    return panel;
  },
};

function installEnhancements(panel: BaseAssetGridPanel): void {
  if (enhancedPanels.has(panel)) {
    return;
  }
  enhancedPanels.add(panel);

  const internal = panel as unknown as { panel: vscode.WebviewPanel; assetProfile: AssetProfile };
  internal.panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const profileId = parseSetAssetProfileMessage(message);
    if (!profileId) {
      return;
    }

    try {
      await updateConfiguredAssetProfile(profileId);
    } catch (error) {
      await internal.panel.webview.postMessage({ type: "assetProfileUpdateFailed" });
      const detail = error instanceof Error ? ` ${error.message}` : "";
      await vscode.window.showErrorMessage(
        `Game Asset Explorer: ${vscode.l10n.t("Unable to change Asset Profile.")}${detail}`,
      );
    }
  });

  const originalUpdate = panel.update.bind(panel);
  panel.update = (assets: readonly WorkspaceAsset[], assetProfile?: AssetProfile): void => {
    originalUpdate(assets, assetProfile);
    enhanceRenderedHtml(panel);
  };
}

function enhanceRenderedHtml(panel: BaseAssetGridPanel): void {
  const internal = panel as unknown as { panel: vscode.WebviewPanel; assetProfile: AssetProfile };
  const strings = createAssetGridUiStrings((message) => vscode.l10n.t(message));
  const localized = localizeAssetGridHtml(
    internal.panel.webview.html,
    strings,
    vscode.env.language,
  );
  internal.panel.webview.html = injectAssetProfileSelector(
    localized,
    internal.assetProfile,
    {
      label: vscode.l10n.t("Genre / Profile"),
      profileLabels: strings.profileLabels,
    },
  );
}
