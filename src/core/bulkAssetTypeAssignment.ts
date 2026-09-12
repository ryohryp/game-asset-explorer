import type { WorkspaceAsset } from "../workspaceAsset";

export function selectUncategorizedAssetsInFolder(
  assets: readonly WorkspaceAsset[],
  workspaceFolderUri: string,
  folder: string,
): WorkspaceAsset[] {
  const normalizedFolder = normalizeFolder(folder);
  return assets.filter((asset) =>
    asset.workspaceFolderUri === workspaceFolderUri
    && !asset.assetType
    && folderOf(asset.asset.relativePath) === normalizedFolder,
  );
}

function folderOf(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length <= 1 ? "" : parts.slice(0, -1).join("/");
}

function normalizeFolder(folder: string): string {
  return folder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}
