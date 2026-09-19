export interface AssetDependencyUsage {
  sourcePath: string;
  line: number;
  character: number;
}

export interface AssetDependencySource {
  sourcePath: string;
  usageCount: number;
  firstLine: number;
  firstCharacter: number;
}

export interface AssetDependencyView {
  assetPath: string;
  sources: AssetDependencySource[];
  caveat: string;
}

export function buildAssetDependencyView(
  assetPath: string,
  usages: readonly AssetDependencyUsage[],
): AssetDependencyView {
  const grouped = new Map<string, AssetDependencySource>();
  for (const usage of usages) {
    const existing = grouped.get(usage.sourcePath);
    if (existing) {
      existing.usageCount += 1;
      continue;
    }
    grouped.set(usage.sourcePath, {
      sourcePath: usage.sourcePath,
      usageCount: 1,
      firstLine: usage.line,
      firstCharacter: usage.character,
    });
  }
  return {
    assetPath,
    sources: [...grouped.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    caveat: "Static direct references only; dynamic references may not appear.",
  };
}
