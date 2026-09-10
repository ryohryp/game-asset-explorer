import * as path from "node:path";
import { AssetFileType } from "./core/assetScanner";
import { filterWorkspaceAssets, WorkspaceAsset } from "./workspaceAsset";

export interface AssetFacetSelection {
  folder?: string;
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
    if (selection.fileType && asset.fileType !== selection.fileType) {
      return false;
    }
    if (selection.workspaceFolderUri && workspaceAsset.workspaceFolderUri !== selection.workspaceFolderUri) {
      return false;
    }
    return true;
  });
}

export function buildAssetFacetOptions(assets: readonly WorkspaceAsset[]): AssetFacetOptions {
  const folderCounts = new Map<string, number>();
  const fileTypeCounts = new Map<string, number>();
  const workspaceCounts = new Map<string, { label: string; count: number }>();

  for (const workspaceAsset of assets) {
    increment(folderCounts, getAssetFolder(workspaceAsset.asset.relativePath));
    increment(fileTypeCounts, workspaceAsset.asset.fileType);

    const existingWorkspace = workspaceCounts.get(workspaceAsset.workspaceFolderUri);
    workspaceCounts.set(workspaceAsset.workspaceFolderUri, {
      label: workspaceAsset.workspaceFolderName,
      count: (existingWorkspace?.count ?? 0) + 1,
    });
  }

  return {
    folders: [...folderCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, count]) => ({ value, label: value, count })),
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
): AssetFacetSelection {
  const options = buildAssetFacetOptions(assets);
  return {
    folder: hasOption(options.folders, selection.folder) ? selection.folder : undefined,
    fileType: hasOption(options.fileTypes, selection.fileType) ? selection.fileType : undefined,
    workspaceFolderUri: hasOption(options.workspaces, selection.workspaceFolderUri)
      ? selection.workspaceFolderUri
      : undefined,
  };
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
