import { UNCATEGORIZED_ASSET_TYPE_LABEL, type AssetProfile } from "./assetProfiles";

export interface CategorizedAsset {
  assetType?: string;
  assetSubtype?: string;
}

export interface AssetSubtypeSummary {
  subtype: string;
  count: number;
}

export interface AssetCategorySummaryItem {
  assetType: string;
  count: number;
  subtypes: AssetSubtypeSummary[];
  unsetSubtypeCount: number;
}

export interface AssetCategorySummary {
  categories: AssetCategorySummaryItem[];
  uncategorizedLabel: string;
  uncategorizedCount: number;
}

export function buildAssetCategorySummary(
  profile: AssetProfile,
  assets: readonly CategorizedAsset[],
): AssetCategorySummary {
  const categories = profile.assetTypes.map((assetType) => {
    const matchingAssets = assets.filter((asset) => asset.assetType === assetType);
    const expectedSubtypes = profile.subtypes[assetType] ?? [];
    return {
      assetType,
      count: matchingAssets.length,
      subtypes: expectedSubtypes.map((subtype) => ({
        subtype,
        count: matchingAssets.filter((asset) => asset.assetSubtype === subtype).length,
      })),
      unsetSubtypeCount: expectedSubtypes.length > 0
        ? matchingAssets.filter((asset) => !asset.assetSubtype).length
        : 0,
    };
  });

  return {
    categories,
    uncategorizedLabel: UNCATEGORIZED_ASSET_TYPE_LABEL,
    uncategorizedCount: assets.filter((asset) => !asset.assetType).length,
  };
}
