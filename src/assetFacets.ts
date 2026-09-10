import * as path from "node:path";
import {
  UNCATEGORIZED_ASSET_TYPE,
  UNCATEGORIZED_ASSET_TYPE_LABEL,
} from "./core/assetProfiles";
import { AssetFileType } from "./core/assetScanner";
import { filterWorkspaceAssets, WorkspaceAsset } from "./workspaceAsset";

export interface AssetFacetSelection {
  folder?: string;
  assetType?: string;
  fileType?: AssetFileType;
  workspaceFolderUri?: string;
}

export interface AssetFacetOption {
  value: string;
  label: string;
  count: number;
}

export interface AssetFacetOptions {
  folders: AssetFacetOption[];
  assetTypes: AssetFacetOption[];
  fileTypes: AssetFacetOption[];
  workspaces: AssetFacetOption[];
}

export function filterWorkspaceAssetsByFacets(
  assets: readonly WorkspaceAsset[],
  query: string,
  selection: AssetFacetSelection = {},
): WorkspaceAsset[] {
  return filterWorkspaceAssets(assets, query).filter((workspaceAsset) => {
    const asset = workspaceAsset.asset;
    if (selection.folder && getAssetFolder(asset.relativePath) !== selection.folder) {
      return false;
    }
    if (selection.assetType && getAssetTypeValue(workspaceAsset) !== selection.assetType) {
      return false;
    }
    if (selection.fileType && asset.fileType !== selection.fileType) {
      return false;
    }
    if (selection.workspaceFolderUri && workspaceAsset.workspaceFolderUri !== selection.workspaceFolderUri) {
      return false;
    }
    return true;
  });
}

export function buildAssetFacetOptions(
  assets: readonly WorkspaceAsset[],
  availableAssetTypes: readonly string[] = [],
): AssetFacetOptions {
  const folderCounts = new Map<string, number>();
  const assetTypeCounts = new Map<string, number>();
  const fileTypeCounts = new Map<string, number>();
  const workspaceCounts = new Map<string, { label: string; count: number }>();

  for (const workspaceAsset of assets) {
    increment(folderCounts, getAssetFolder(workspaceAsset.asset.relativePath));
    increment(assetTypeCounts, getAssetTypeValue(workspaceAsset));
    increment(fileTypeCounts, workspaceAsset.asset.fileType);

    const existingWorkspace = workspaceCounts.get(workspaceAsset.workspaceFolderUri);
    workspaceCounts.set(workspaceAsset.workspaceFolderUri, {
      label: workspaceAsset.workspaceFolderName,
      count: (existingWorkspace?.count ?? 0) + 1,
    });
  }

  const profileAssetTypes = availableAssetTypes.length > 0
    ? unique(availableAssetTypes)
    : [...assetTypeCounts.keys()]
      .filter((assetType) => assetType !== UNCATEGORIZED_ASSET_TYPE)
      .sort((left, right) => left.localeCompare(right));

  return {
    folders: [...folderCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, count]) => ({ value, label: value, count })),
    assetTypes: [
      ...profileAssetTypes.map((value) => ({ value, label: value, count: assetTypeCounts.get(value) ?? 0 })),
      {
        value: UNCATEGORIZED_ASSET_TYPE,
        label: UNCATEGORIZED_ASSET_TYPE_LABEL,
        count: assetTypeCounts.get(UNCATEGORIZED_ASSET_TYPE) ?? 0,
      },
    ],
    fileTypes: [...fileTypeCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, count]) => ({ value, label: value.toUpperCase(), count })),
    workspaces: [...workspaceCounts.entries()]
      .sort(([, left], [, right]) => left.label.localeCompare(right.label))
      .map(([value, item]) => ({ value, label: item.label, count: item.count })),
  };
}

export function reconcileAssetFacetSelection(
  selection: AssetFacetSelection,
  assets: readonly WorkspaceAsset[],
  availableAssetTypes: readonly string[] = [],
): AssetFacetSelection {
  const options = buildAssetFacetOptions(assets, availableAssetTypes);
  return {
    folder: hasOption(options.folders, selection.folder) ? selection.folder : undefined,
    assetType: hasOption(options.assetTypes, selection.assetType) ? selection.assetType : undefined,
    fileType: hasOption(options.fileTypes, selection.fileType) ? selection.fileType : undefined,
    workspaceFolderUri: hasOption(options.workspaces, selection.workspaceFolderUri)
      ? selection.workspaceFolderUri
      : undefined,
  };
}

function getAssetTypeValue(workspaceAsset: WorkspaceAsset): string {
  return workspaceAsset.assetType ?? UNCATEGORIZED_ASSET_TYPE;
}

function getAssetFolder(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const folder = path.posix.dirname(normalized);
  return folder === "." ? "(root)" : folder;
}

function increment(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function hasOption(options: readonly AssetFacetOption[], value: string | undefined): boolean {
  return value === undefined || options.some((option) => option.value === value);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
