export interface AssetHealthDashboardCounts {
  totalAssets: number;
  gitModified: number;
  potentiallyUnused: number;
  duplicateAssets: number;
  problems: number;
}

export function buildAssetHealthDashboardCounts(input: {
  totalAssets: number;
  gitModified: number;
  potentiallyUnused: number;
  duplicateGroups: readonly { assets: readonly unknown[] }[];
  problems: number;
}): AssetHealthDashboardCounts {
  return {
    totalAssets: input.totalAssets,
    gitModified: input.gitModified,
    potentiallyUnused: input.potentiallyUnused,
    duplicateAssets: input.duplicateGroups.reduce((sum, group) => sum + group.assets.length, 0),
    problems: input.problems,
  };
}
