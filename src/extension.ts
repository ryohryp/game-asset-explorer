import * as path from "node:path";
import * as vscode from "vscode";
import { inspectWorkspaceAssetHealth } from "./assetHealthSearch";
import { loadAssetDetails } from "./core/assetDetails";
import { isSupportedAssetPath, scanAssets } from "./core/assetScanner";
import { DebouncedAction } from "./core/debouncedAction";
import { AssetGridPanel } from "./ui/assetGridPanel";
import { findWorkspaceAssetUsages, openAssetUsage } from "./usageSearch";
import {
  approveVariantIntoWorkspace,
  startOpenAiVariantReview,
  storeOpenAiApiKey,
} from "./variantRuntime";
import { VariantReviewController } from "./variantReviewController";
import { VariantWorkflow } from "./variantWorkflow";
import { filterWorkspaceAssets, getWorkspaceAssetIdentity, WorkspaceAsset } from "./workspaceAsset";

let discoveredAssets: WorkspaceAsset[] = [];
let disposeWatcherResources: (() => void) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  let activePanel: AssetGridPanel | undefined;
  let watcherDisposables: vscode.Disposable[] = [];
  let watcherRefresh: DebouncedAction | undefined;

  const scanAndStore = async (showMessage: boolean): Promise<WorkspaceAsset[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      discoveredAssets = [];
      if (showMessage) {
        await vscode.window.showWarningMessage("Game Asset Explorer: Open a workspace before scanning assets.");
      }
      return discoveredAssets;
    }

    const nextAssets: WorkspaceAsset[] = [];
    const warnings: string[] = [];

    for (const workspaceFolder of workspaceFolders) {
      const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
      const assetDirectories = configuration.get<string[]>("assetDirectories", []);

      const result = await scanAssets({
        workspaceRoot: workspaceFolder.uri.fsPath,
        assetDirectories,
      });

      nextAssets.push(...result.assets.map((asset) => ({
        workspaceFolderUri: workspaceFolder.uri.toString(),
        workspaceFolderName: workspaceFolder.name,
        asset,
      })));
      warnings.push(...result.warnings.map((warning) => `${workspaceFolder.name}: ${warning}`));
    }

    discoveredAssets = nextAssets;

    if (warnings.length > 0) {
      console.warn("Game Asset Explorer asset scan warnings:\n" + warnings.join("\n"));
    }

    if (showMessage) {
      const warningSuffix = warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : "";
      await vscode.window.showInformationMessage(
        `Game Asset Explorer: Found ${discoveredAssets.length} image asset${discoveredAssets.length === 1 ? "" : "s"}${warningSuffix}.`,
      );
    }

    return discoveredAssets;
  };

  const refreshFromFilesystem = async (): Promise<void> => {
    const assets = await scanAndStore(false);
    if (!activePanel) {
      return;
    }

    try {
      activePanel.update(assets);
    } catch (error) {
      activePanel = undefined;
      console.warn("Game Asset Explorer: Unable to refresh closed asset grid.", error);
    }
  };

  const disposeWatchers = (): void => {
    watcherRefresh?.dispose();
    watcherRefresh = undefined;

    for (const disposable of watcherDisposables) {
      disposable.dispose();
    }
    watcherDisposables = [];
  };

  const rebuildWatchers = (): void => {
    disposeWatchers();

    watcherRefresh = new DebouncedAction(() => {
      void refreshFromFilesystem().catch((error) => {
        console.error("Game Asset Explorer: Automatic asset refresh failed.", error);
      });
    }, 250);

    for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
      const configuration = vscode.workspace.getConfiguration("gameAssetExplorer", workspaceFolder.uri);
      const assetDirectories = configuration.get<string[]>("assetDirectories", []);

      for (const configuredDirectory of assetDirectories) {
        const trimmedDirectory = configuredDirectory.trim();
        if (!trimmedDirectory) {
          continue;
        }

        const directoryPath = path.isAbsolute(trimmedDirectory)
          ? path.normalize(trimmedDirectory)
          : path.resolve(workspaceFolder.uri.fsPath, trimmedDirectory);
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.Uri.file(directoryPath), "**/*"),
        );
        const onAssetEvent = (uri: vscode.Uri): void => {
          if (isSupportedAssetPath(uri.fsPath)) {
            watcherRefresh?.trigger();
          }
        };

        watcherDisposables.push(
          watcher,
          watcher.onDidCreate(onAssetEvent),
          watcher.onDidChange(onAssetEvent),
          watcher.onDidDelete(onAssetEvent),
        );
      }
    }
  };

  disposeWatcherResources = disposeWatchers;
  rebuildWatchers();

  const findAsset = (identity: string): WorkspaceAsset | undefined => (
    discoveredAssets.find((asset) => getWorkspaceAssetIdentity(asset) === identity)
  );

  const scanCommand = vscode.commands.registerCommand("gameAssetExplorer.scanAssets", async () => {
    await scanAndStore(true);
  });

  const setOpenAiApiKeyCommand = vscode.commands.registerCommand("gameAssetExplorer.setOpenAiApiKey", async () => {
    await storeOpenAiApiKey(context);
  });

  const openCommand = vscode.commands.registerCommand("gameAssetExplorer.openAssetGrid", async () => {
    let activeVariantAsset: WorkspaceAsset | undefined;
    const reviewController = new VariantReviewController(async (session, candidateId) => {
      if (!activeVariantAsset) {
        throw new Error("Generate Variant lost its selected Approved Anchor.");
      }
      await approveVariantIntoWorkspace(session, candidateId, activeVariantAsset, discoveredAssets);
    });
    const variantWorkflow = new VariantWorkflow(
      reviewController,
      (selectedAsset, generationPackage) => startOpenAiVariantReview(
        context,
        selectedAsset,
        discoveredAssets,
        generationPackage,
      ),
    );

    const panel = AssetGridPanel.show({
      extensionUri: context.extensionUri,
      onRefresh: () => scanAndStore(false),
      onSearch: (query) => filterWorkspaceAssets(discoveredAssets, query),
      onSelect: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return { status: "missing" as const };
        }

        const details = await loadAssetDetails(workspaceAsset.asset);
        return {
          ...details,
          workspaceAsset,
        };
      },
      onCopyPath: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return false;
        }

        await vscode.env.clipboard.writeText(workspaceAsset.asset.relativePath);
        return true;
      },
      onFindUsages: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return [];
        }

        return findWorkspaceAssetUsages(workspaceAsset);
      },
      onCheckHealth: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return undefined;
        }

        return inspectWorkspaceAssetHealth(workspaceAsset, discoveredAssets);
      },
      onStartVariant: async (identity, input) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          throw new Error("Selected asset is no longer available. Refresh and try again.");
        }

        activeVariantAsset = workspaceAsset;
        try {
          return await variantWorkflow.start(workspaceAsset, input);
        } catch (error) {
          if (!reviewController.hasActiveReview) {
            activeVariantAsset = undefined;
          }
          throw error;
        }
      },
      onApproveVariant: async (candidateId) => {
        await reviewController.approve(candidateId);
        activeVariantAsset = undefined;
        const assets = await scanAndStore(false);
        await vscode.window.showInformationMessage("Game Asset Explorer: Generated variant approved and added to the workspace.");
        return assets;
      },
      onRejectVariant: async () => {
        if (reviewController.hasActiveReview) {
          reviewController.reject();
        }
        activeVariantAsset = undefined;
      },
      onOpenUsage: openAssetUsage,
    });

    activePanel = panel;
    const assets = await scanAndStore(false);
    panel.update(assets);
  });

  const workspaceFolderListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    rebuildWatchers();
    watcherRefresh?.trigger();
  });

  const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration("gameAssetExplorer.assetDirectories")) {
      return;
    }

    rebuildWatchers();
    watcherRefresh?.trigger();
  });

  context.subscriptions.push(
    scanCommand,
    setOpenAiApiKeyCommand,
    openCommand,
    workspaceFolderListener,
    configurationListener,
    { dispose: disposeWatchers },
  );
}

export function deactivate(): void {
  disposeWatcherResources?.();
  disposeWatcherResources = undefined;
  discoveredAssets = [];
}
