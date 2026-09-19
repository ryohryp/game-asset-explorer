import * as path from "node:path";
import * as vscode from "vscode";
import { configureAssetDirectories, updateAssetDirectoryContext } from "./assetDirectoryConfiguration";
import { findPotentiallyUnusedWorkspaceAssets, inspectWorkspaceAssetHealth } from "./assetHealthSearch";
import { loadAssetDetails } from "./core/assetDetails";
import { buildAssetCategorySummary } from "./core/assetCategorySummary";
import { selectUncategorizedAssetsInFolder } from "./core/bulkAssetTypeAssignment";
import { analyzeFolderOrganization } from "./core/folderOrganization";
import { buildOrganizationPrompt } from "./core/organizationPrompt";
import { enrichOrganizationReportWithFolderIntent } from "./organizationIntentWorkspace";
import {
  getAssetSubtypes,
  resolveAssetProfile,
  type AssetProfile,
  type AssetProfileCustomization,
} from "./core/assetProfiles";
import { isSupportedAssetPath, scanAssets } from "./core/assetScanner";
import { ASSET_TYPE_METADATA_PATH } from "./core/assetTypeMetadata";
import { DebouncedAction } from "./core/debouncedAction";
import { GENERATION_LINEAGE_PATH } from "./core/generationLineage";
import { VISUAL_CANON_PATH } from "./core/visualCanon";
import {
  loadWorkspaceAssetTypes,
  updateWorkspaceAssetCharacter,
  updateWorkspaceAssetSubtype,
  updateWorkspaceAssetType,
  updateWorkspaceAssetTypes,
  type WorkspaceAssetTypeStore,
} from "./assetTypeWorkspace";
import {
  loadWorkspaceGenerationLineageForAsset,
  type WorkspaceGenerationLineageReader,
} from "./generationLineageWorkspace";
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
  saveWorkspaceVisualCanonEntry,
  type WorkspaceVisualCanonStore,
} from "./visualCanonWorkspace";
import { filterWorkspaceAssets, getWorkspaceAssetIdentity, WorkspaceAsset } from "./workspaceAsset";

let discoveredAssets: WorkspaceAsset[] = [];

export function getDiscoveredAssets(): readonly WorkspaceAsset[] { return discoveredAssets; }
let disposeWatcherResources: (() => void) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  let activePanel: AssetGridPanel | undefined;
  let activeProfile = getConfiguredAssetProfile();
  let selectedAssetIdentity: string | undefined;
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

  const visualCanonReader: WorkspaceVisualCanonStore = {
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
    write: async (workspaceFolderUri, text) => {
      const workspaceUri = vscode.Uri.parse(workspaceFolderUri);
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceUri, ".game-asset-explorer"));
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(workspaceUri, VISUAL_CANON_PATH),
        new TextEncoder().encode(text),
      );
    },
  };

  const generationLineageReader: WorkspaceGenerationLineageReader = {
    read: async (workspaceFolderUri) => {
      const lineageUri = vscode.Uri.joinPath(vscode.Uri.parse(workspaceFolderUri), GENERATION_LINEAGE_PATH);
      try {
        return new TextDecoder().decode(await vscode.workspace.fs.readFile(lineageUri));
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
        await vscode.window.showWarningMessage(
          `Game Asset Explorer: ${vscode.l10n.t("Open a workspace before scanning assets.")}`,
        );
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
        `Game Asset Explorer: ${vscode.l10n.t("Found {0} image assets{1}.", discoveredAssets.length, warningSuffix)}`,
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

      const lineageWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, GENERATION_LINEAGE_PATH),
      );
      const onLineageEvent = (): void => watcherRefresh?.trigger();
      watcherDisposables.push(
        lineageWatcher,
        lineageWatcher.onDidCreate(onLineageEvent),
        lineageWatcher.onDidChange(onLineageEvent),
        lineageWatcher.onDidDelete(onLineageEvent),
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

  const showCategorySummaryCommand = vscode.commands.registerCommand("gameAssetExplorer.showCategorySummary", async () => {
    const assets = discoveredAssets.length > 0 ? discoveredAssets : await scanAndStore(false);
    activeProfile = getConfiguredAssetProfile();
    const summary = buildAssetCategorySummary(activeProfile, assets);
    const items: vscode.QuickPickItem[] = [];
    const countLabel = (count: number): string => vscode.l10n.t(
      count === 1 ? "{0} asset" : "{0} assets",
      count,
    );

    for (const category of summary.categories) {
      const categoryLabel = vscode.l10n.t(category.assetType);
      if (category.subtypes.length === 0) {
        items.push({
          label: categoryLabel,
          description: countLabel(category.count),
        });
        continue;
      }

      items.push({
        label: `${categoryLabel} (${category.count})`,
        kind: vscode.QuickPickItemKind.Separator,
      });
      for (const subtype of category.subtypes) {
        items.push({
          label: `$(symbol-field) ${subtype.subtype}`,
          description: countLabel(subtype.count),
          detail: subtype.count === 0
            ? vscode.l10n.t("Expected slot · currently empty")
            : vscode.l10n.t("Expected slot"),
        });
      }
      if (category.unsetSubtypeCount > 0) {
        items.push({
          label: `$(question) ${vscode.l10n.t("Subtype unset")}`,
          description: countLabel(category.unsetSubtypeCount),
        });
      }
    }

    items.push({ label: vscode.l10n.t("Other"), kind: vscode.QuickPickItemKind.Separator });
    items.push({
      label: vscode.l10n.t(summary.uncategorizedLabel),
      description: countLabel(summary.uncategorizedCount),
    });

    await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t("Asset Categories · {0}", vscode.l10n.t(activeProfile.label)),
      placeHolder: vscode.l10n.t("Expected categories and subtype slots, including empty slots"),
      matchOnDescription: true,
      matchOnDetail: true,
    });
  });

  const setAssetSubtypeCommand = vscode.commands.registerCommand("gameAssetExplorer.setAssetSubtype", async () => {
    const selectedAsset = selectedAssetIdentity ? findAsset(selectedAssetIdentity) : undefined;
    if (!selectedAsset) {
      await vscode.window.showInformationMessage(
        `Game Asset Explorer: ${vscode.l10n.t("Select an asset in Asset Grid first.")}`,
      );
      return;
    }
    if (!selectedAsset.assetType) {
      await vscode.window.showInformationMessage(
        `Game Asset Explorer: ${vscode.l10n.t("Assign an Asset Type before assigning a subtype.")}`,
      );
      return;
    }

    activeProfile = getConfiguredAssetProfile();
    const subtypes = getAssetSubtypes(activeProfile, selectedAsset.assetType);
    if (subtypes.length === 0) {
      await vscode.window.showInformationMessage(
        `Game Asset Explorer: ${vscode.l10n.t(
          "{0} has no subtype slots in the active {1} profile.",
          vscode.l10n.t(selectedAsset.assetType),
          vscode.l10n.t(activeProfile.label),
        )}`,
      );
      return;
    }

    type SubtypePick = vscode.QuickPickItem & { assetSubtype: string | undefined };
    const choices: SubtypePick[] = [
      {
        label: `$(circle-slash) ${vscode.l10n.t("Clear subtype")}`,
        description: selectedAsset.assetSubtype
          ? vscode.l10n.t("Currently {0}", selectedAsset.assetSubtype)
          : vscode.l10n.t("Subtype is already unset"),
        assetSubtype: undefined,
      },
      ...subtypes.map((assetSubtype): SubtypePick => ({
        label: assetSubtype,
        description: selectedAsset.assetSubtype === assetSubtype
          ? vscode.l10n.t("Current subtype")
          : undefined,
        assetSubtype,
      })),
    ];
    const picked = await vscode.window.showQuickPick(choices, {
      title: vscode.l10n.t("Set subtype · {0}", selectedAsset.asset.fileName),
      placeHolder: vscode.l10n.t("{0} subtype", vscode.l10n.t(selectedAsset.assetType)),
    });
    if (!picked) {
      return;
    }

    await updateWorkspaceAssetSubtype(selectedAsset, picked.assetSubtype, activeProfile, assetTypeStore);
    await refreshFromFilesystem();
    await vscode.window.showInformationMessage(
      picked.assetSubtype
        ? `Game Asset Explorer: ${vscode.l10n.t("Set subtype to {0}.", picked.assetSubtype)}`
        : `Game Asset Explorer: ${vscode.l10n.t("Cleared asset subtype.")}`,
    );
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
      onAnalyzeOrganization: async () => enrichOrganizationReportWithFolderIntent(analyzeFolderOrganization(discoveredAssets)),
      onCopyOrganizationPrompt: async () => {
        const report = await enrichOrganizationReportWithFolderIntent(analyzeFolderOrganization(discoveredAssets));
        activeProfile = getConfiguredAssetProfile();
        await vscode.env.clipboard.writeText(buildOrganizationPrompt(report, discoveredAssets, activeProfile.assetTypes));
      },
      onBulkAssignAssetType: async (workspaceFolderUri, folder, assetType) => {
        activeProfile = getConfiguredAssetProfile();
        const report = analyzeFolderOrganization(discoveredAssets);
        const eligible = report.metadataFindings.some((finding) =>
          finding.kind === "uncategorized-assets"
          && finding.workspaceFolderUri === workspaceFolderUri
          && finding.affectedFolders.length === 1
          && finding.affectedFolders[0] === folder,
        );
        if (!eligible) throw new Error("This folder is no longer eligible for bulk Asset Type assignment. Analyze Organization again.");
        const targets = selectUncategorizedAssetsInFolder(discoveredAssets, workspaceFolderUri, folder);
        if (targets.length === 0) throw new Error("No Uncategorized assets remain in this folder.");
        const updatedCount = await updateWorkspaceAssetTypes(targets, assetType, activeProfile, assetTypeStore);
        const assets = await scanAndStore(false);
        await vscode.window.showInformationMessage(
          `Game Asset Explorer: ${vscode.l10n.t(
            "Assigned {0} assets in {1} as {2}.",
            updatedCount,
            folder || vscode.l10n.t("Workspace root"),
            assetType,
          )}`,
        );
        return assets;
      },
      onSelect: async (identity) => {
        selectedAssetIdentity = identity;
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          selectedAssetIdentity = undefined;
          return { status: "missing" as const };
        }

        const details = await loadAssetDetails(workspaceAsset.asset);
        let visualCanon: { memberships: Awaited<ReturnType<typeof loadWorkspaceVisualCanonForAsset>>["memberships"]; error?: string };
        try {
          const state = await loadWorkspaceVisualCanonForAsset(workspaceAsset, visualCanonReader);
          visualCanon = { memberships: state.memberships };
        } catch (error) {
          visualCanon = { memberships: [], error: formatError(error) };
        }

        let lineage: { sources: Array<{ path: string; exists: boolean }>; variants: Array<{ path: string; exists: boolean }>; error?: string };
        try {
          lineage = await loadWorkspaceGenerationLineageForAsset(
            workspaceAsset,
            discoveredAssets,
            generationLineageReader,
          );
        } catch (error) {
          lineage = { sources: [], variants: [], error: formatError(error) };
        }

        return { ...details, workspaceAsset, visualCanon, lineage };
      },
      onSetAssetType: async (identity, assetType) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          throw new Error(vscode.l10n.t("Selected asset is no longer available. Refresh and try again."));
        }

        activeProfile = getConfiguredAssetProfile();
        await updateWorkspaceAssetType(workspaceAsset, assetType, activeProfile, assetTypeStore);
        return scanAndStore(false);
      },
      onSetCharacter: async (identity, character) => {
        const workspaceAsset = findAsset(identity);
        if (!workspaceAsset) {
          throw new Error(vscode.l10n.t("Selected asset is no longer available. Refresh and try again."));
        }

        await updateWorkspaceAssetCharacter(workspaceAsset, character, assetTypeStore);
        return scanAndStore(false);
      },
      onEditVisualCanon: async (identity) => {
        const selected = findAsset(identity);
        if (!selected) throw new Error(vscode.l10n.t("Selected asset is no longer available. Refresh and try again."));
        const state = await loadWorkspaceVisualCanonForAsset(selected, visualCanonReader);
        const existing = state.memberships.length === 1 && state.canon
          ? state.canon.entries.find((entry) => entry.id === state.memberships[0].id)
          : undefined;
        const id = await vscode.window.showInputBox({
          title: vscode.l10n.t("Visual Canon entry"),
          prompt: vscode.l10n.t("Short Git-friendly id for this Canon entry"),
          value: existing?.id ?? selected.asset.fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-"),
          validateInput: (value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.trim()) ? undefined : vscode.l10n.t("Use letters, numbers, dot, underscore, or hyphen."),
        });
        if (!id) return;
        const kinds = ["character", "environment", "ui", "item", "effect", "other"] as const;
        const kindPick = await vscode.window.showQuickPick(kinds.map((kind) => ({ label: kind, assetKind: kind })), {
          title: vscode.l10n.t("Visual Canon kind"),
          placeHolder: existing?.kind,
        });
        if (!kindPick) return;
        const sameWorkspace = discoveredAssets.filter((asset) => asset.workspaceFolderUri === selected.workspaceFolderUri);
        const anchorPicks = await vscode.window.showQuickPick(
          sameWorkspace.map((asset) => ({
            label: asset.asset.relativePath,
            identity: getWorkspaceAssetIdentity(asset),
            picked: asset.asset.relativePath === selected.asset.relativePath || existing?.anchors.includes(asset.asset.relativePath),
          })),
          { title: vscode.l10n.t("Visual Canon anchors"), canPickMany: true, placeHolder: vscode.l10n.t("Select one or more workspace images") },
        );
        if (!anchorPicks) return;
        const anchors = Array.from(new Set([selected.asset.relativePath, ...anchorPicks.map((pick) => pick.label)]));
        const constraintsText = await vscode.window.showInputBox({
          title: vscode.l10n.t("Visual Canon constraints"),
          prompt: vscode.l10n.t("Comma-separated semantic/style constraints (optional)"),
          value: existing?.constraints?.join(", ") ?? "",
        });
        if (constraintsText === undefined) return;
        await saveWorkspaceVisualCanonEntry(selected, {
          id: id.trim(),
          kind: kindPick.assetKind,
          anchors,
          ...(constraintsText.trim() ? { constraints: constraintsText.split(",").map((value) => value.trim()).filter(Boolean) } : {}),
          ...(existing?.forbidden?.length ? { forbidden: existing.forbidden } : {}),
        }, discoveredAssets, visualCanonReader);
        await vscode.window.showInformationMessage(`Game Asset Explorer: ${vscode.l10n.t("Visual Canon saved.")}`);
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
      onFindPotentiallyUnused: () => findPotentiallyUnusedWorkspaceAssets(discoveredAssets),
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
          throw new Error(vscode.l10n.t("Selected asset is no longer available. Refresh and try again."));
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
        await vscode.window.showInformationMessage(
          `Game Asset Explorer: ${vscode.l10n.t("Generated variant approved and added to the workspace.")}`,
        );
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
      || event.affectsConfiguration("gameAssetExplorer.customAssetTypes")
      || event.affectsConfiguration("gameAssetExplorer.assetProfileOverrides");
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
    showCategorySummaryCommand,
    setAssetSubtypeCommand,
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
    configuration.get<AssetProfileCustomization>("assetProfileOverrides", {}),
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
