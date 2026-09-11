import * as path from "node:path";
import * as vscode from "vscode";
import { configureAssetDirectories, updateAssetDirectoryContext } from "./assetDirectoryConfiguration";
import { inspectWorkspaceAssetHealth } from "./assetHealthSearch";
import { loadAssetDetails } from "./core/assetDetails";
import { analyzeFolderOrganization } from "./core/folderOrganization";
import { resolveAssetProfile, type AssetProfile } from "./core/assetProfiles";
import { isSupportedAssetPath, scanAssets } from "./core/assetScanner";
import { ASSET_TYPE_METADATA_PATH } from "./core/assetTypeMetadata";
import { DebouncedAction } from "./core/debouncedAction";
import { VISUAL_CANON_PATH } from "./core/visualCanon";
import {
  loadWorkspaceAssetTypes,
  updateWorkspaceAssetCharacter,
  updateWorkspaceAssetType,
  type WorkspaceAssetTypeStore,
} from "./assetTypeWorkspace";
import { AssetGridPanel } from "./ui/assetGridPanel";
import { findWorkspaceAssetUsages, openAssetUsage } from "./usageSearch";
import {
  approveVariantIntoWorkspace,
  startOpenAiVariantReview,
  storeOpenAiApiKey,
} from "./variantRuntime";
import { VariantReviewController } from "./variantReviewController";
import { VariantWorkflow } from "./variantWorkflow";
import {
  loadWorkspaceVisualCanonForAsset,
  resolveUnambiguousWorkspaceVisualCanon,
  type WorkspaceVisualCanonReader,
} from "./visualCanonWorkspace";
import { filterWorkspaceAssets, getWorkspaceAssetIdentity, WorkspaceAsset } from "./workspaceAsset";

let discoveredAssets: WorkspaceAsset[] = [];
let disposeWatcherResources: (() => void) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  let activePanel: AssetGridPanel | undefined;
  let activeProfile = getConfiguredAssetProfile();
  let watcherDisposables: vscode.Disposable[] = [];
  let watcherRefresh: DebouncedAction | undefined;

  const assetTypeStore: WorkspaceAssetTypeStore = {
    read: async (workspaceFolderUri) => {
      const metadataUri = vscode.Uri.joinPath(vscode.Uri.parse(workspaceFolderUri), ASSET_TYPE_METADATA_PATH);
      try {
        return new TextDecoder().decode(await vscode.workspace.fs.readFile(metadataUri));
      } catch (error) {
        if (isFileNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },
    write: async (workspaceFolderUri, text) => {
      const workspaceUri = vscode.Uri.parse(workspaceFolderUri);
      const metadataDirectory = vscode.Uri.joinPath(workspaceUri, ".game-asset-explorer");
      await vscode.workspace.fs.createDirectory(metadataDirectory);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(workspaceUri, ASSET_TYPE_METADATA_PATH),
        new TextEncoder().encode(text),
      );
    },
  };

  const visualCanonReader: WorkspaceVisualCanonReader = {
    read: async (workspaceFolderUri) => {
      const canonUri = vscode.Uri.joinPath(vscode.Uri.parse(workspaceFolderUri), VISUAL_CANON_PATH);
      try {
        return new TextDecoder().decode(await vscode.workspace.fs.readFile(canonUri));
      } catch (error) {
        if (isFileNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },
  };

  const scanAndStore = async (showMessage: boolean): Promise<WorkspaceAsset[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    activeProfile = getConfiguredAssetProfile();
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

      const workspaceAssets = result.assets.map((asset) => ({
        workspaceFolderUri: workspaceFolder.uri.toString(),
        workspaceFolderName: workspaceFolder.name,
        asset,
      }));
      try {
        nextAssets.push(...await loadWorkspaceAssetTypes(workspaceAssets, activeProfile, assetTypeStore));
      } catch (error) {
        nextAssets.push(...workspaceAssets);
        warnings.push(
          `${workspaceFolder.name}: Unable to load ${ASSET_TYPE_METADATA_PATH}: ${formatError(error)}. Assets remain available as Uncategorized.`,
        );
      }
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
      activePanel.update(assets, activeProfile);
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

      const metadataWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, ASSET_TYPE_METADATA_PATH),
      );
      const onMetadataEvent = (): void => watcherRefresh?.trigger();
      watcherDisposables.push(
        metadataWatcher,
        metadataWatcher.onDidCreate(onMetadataEvent),
        metadataWatcher.onDidChange(onMetadataEvent),
        metadataWatcher.onDidDelete(onMetadataEvent),
      );

      const visualCanonWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, VISUAL_CANON_PATH),
      );
      const onVisualCanonEvent = (): void => watcherRefresh?.trigger();
      watcherDisposables.push(
        visualCanonWatcher,
        visualCanonWatcher.onDidCreate(onVisualCanonEvent),
        visualCanonWatcher.onDidChange(onVisualCanonEvent),
        visualCanonWatcher.onDidDelete(onVisualCanonEvent),
      );
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
    activeProfile = getConfiguredAssetProfile();
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
      assetProfile: activeProfile,
      onRefresh: () => scanAndStore(false),
      onSearch: (query) => filterWorkspaceAssets(discoveredAssets, query),
      onAnalyzeOrganization: async () => analyzeFolderOrganization(discoveredAssets),
      onSelect: async (identity) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          return { status: "missing" as const };
        }

        const details = await loadAssetDetails(workspaceAsset.asset);
        try {
          const visualCanon = await loadWorkspaceVisualCanonForAsset(workspaceAsset, visualCanonReader);
          return {
            ...details,
            workspaceAsset,
            visualCanon: { memberships: visualCanon.memberships },
          };
        } catch (error) {
          return {
            ...details,
            workspaceAsset,
            visualCanon: { memberships: [], error: formatError(error) },
          };
        }
      },
      onSetAssetType: async (identity, assetType) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          throw new Error("Selected asset is no longer available. Refresh and try again.");
        }

        activeProfile = getConfiguredAssetProfile();
        await updateWorkspaceAssetType(workspaceAsset, assetType, activeProfile, assetTypeStore);
        return scanAndStore(false);
      },
      onSetCharacter: async (identity, character) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          throw new Error("Selected asset is no longer available. Refresh and try again.");
        }

        await updateWorkspaceAssetCharacter(workspaceAsset, character, assetTypeStore);
        return scanAndStore(false);
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
          const visualCanonState = await loadWorkspaceVisualCanonForAsset(workspaceAsset, visualCanonReader);
          const visualCanon = resolveUnambiguousWorkspaceVisualCanon(
            workspaceAsset,
            visualCanonState,
            discoveredAssets,
          );
          return await variantWorkflow.start(workspaceAsset, { ...input, visualCanon });
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
    panel.update(assets, activeProfile);
  });

  const configureAssetDirectoriesCommand = vscode.commands.registerCommand(
    "gameAssetExplorer.configureAssetDirectories",
    async () => {
      const configured = await configureAssetDirectories();
      const availability = await updateAssetDirectoryContext();
      if (configured && availability.hasUsableAssetDirectories) {
        await vscode.commands.executeCommand("gameAssetExplorer.openAssetGrid");
      }
    },
  );

  const emptyTreeDataProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (element) => element,
    getChildren: () => [],
  };
  const assetExplorerView = vscode.window.createTreeView("gameAssetExplorer.explorer", {
    treeDataProvider: emptyTreeDataProvider,
  });
  let openingGridFromActivityBar = false;

  const openGridFromActivityBarIfReady = async (): Promise<void> => {
    if (openingGridFromActivityBar) {
      return;
    }

    const availability = await updateAssetDirectoryContext();
    if (!availability.hasUsableAssetDirectories) {
      return;
    }

    openingGridFromActivityBar = true;
    try {
      await vscode.commands.executeCommand("gameAssetExplorer.openAssetGrid");
    } finally {
      openingGridFromActivityBar = false;
    }
  };

  const activityViewVisibilityListener = assetExplorerView.onDidChangeVisibility((event) => {
    if (!event.visible) {
      return;
    }

    void openGridFromActivityBarIfReady().catch((error) => {
      console.error("Game Asset Explorer: Unable to open the asset grid from the Activity Bar.", error);
    });
  });

  const workspaceFolderListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    rebuildWatchers();
    void refreshFromFilesystem().catch((error) => {
      console.error("Game Asset Explorer: Unable to refresh assets after workspace changes.", error);
    });
    void updateAssetDirectoryContext().catch((error) => {
      console.error("Game Asset Explorer: Unable to refresh first-run workspace state.", error);
    });
  });

  const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
    const assetDirectoriesChanged = event.affectsConfiguration("gameAssetExplorer.assetDirectories");
    const assetProfileChanged = event.affectsConfiguration("gameAssetExplorer.assetProfile")
      || event.affectsConfiguration("gameAssetExplorer.customAssetTypes");
    if (!assetDirectoriesChanged && !assetProfileChanged) {
      return;
    }

    if (assetDirectoriesChanged) {
      rebuildWatchers();
      void updateAssetDirectoryContext().catch((error) => {
        console.error("Game Asset Explorer: Unable to refresh asset-directory state.", error);
      });
    }

    void refreshFromFilesystem().catch((error) => {
      console.error("Game Asset Explorer: Unable to refresh profile-aware asset state.", error);
    });
  });

  void updateAssetDirectoryContext().then(() => {
    if (assetExplorerView.visible) {
      return openGridFromActivityBarIfReady();
    }
    return undefined;
  }).catch((error) => {
    console.error("Game Asset Explorer: Unable to initialize Activity Bar state.", error);
  });

  context.subscriptions.push(
    scanCommand,
    setOpenAiApiKeyCommand,
    openCommand,
    configureAssetDirectoriesCommand,
    assetExplorerView,
    activityViewVisibilityListener,
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

function getConfiguredAssetProfile(): AssetProfile {
  const configuration = vscode.workspace.getConfiguration("gameAssetExplorer");
  return resolveAssetProfile(
    configuration.get<string>("assetProfile", "generic"),
    configuration.get<string[]>("customAssetTypes", []),
  );
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "FileNotFound";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
