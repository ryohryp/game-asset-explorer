import { filterAssets } from "./core/assetSearch";
import { AssetRecord } from "./core/assetScanner";

export interface WorkspaceAsset {
  workspaceFolderUri: string;
  workspaceFolderName: string;
  asset: AssetRecord;
}

export function getWorkspaceAssetIdentity(workspaceAsset: WorkspaceAsset): string {
  return JSON.stringify([workspaceAsset.workspaceFolderUri, workspaceAsset.asset.relativePath]);
}

export function filterWorkspaceAssets(assets: readonly WorkspaceAsset[], query: string): WorkspaceAsset[] {
  const matchingAssets = new Set(filterAssets(assets.map((workspaceAsset) => workspaceAsset.asset), query));
  return assets.filter((workspaceAsset) => matchingAssets.has(workspaceAsset.asset));
}
