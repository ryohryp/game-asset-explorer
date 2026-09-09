import { AssetRecord } from "./assetScanner";

export function filterAssets(assets: readonly AssetRecord[], query: string): AssetRecord[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...assets];
  }

  return assets.filter((asset) => matchesAssetQuery(asset, normalizedQuery));
}

export function matchesAssetQuery(asset: AssetRecord, normalizedQuery: string): boolean {
  return asset.fileName.toLowerCase().includes(normalizedQuery)
    || asset.relativePath.toLowerCase().includes(normalizedQuery);
}
