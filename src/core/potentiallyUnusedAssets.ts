import { extractDirectImageReferences, normalizeWorkspaceImageReference } from "./assetHealth";
import type { WorkspaceAsset } from "../workspaceAsset";

export function findPotentiallyUnusedAssets(
  assets: readonly WorkspaceAsset[],
  texts: readonly string[],
): WorkspaceAsset[] {
  const referencedPaths = new Set<string>();
  for (const text of texts) {
    for (const reference of extractDirectImageReferences(text)) {
      referencedPaths.add(reference.normalizedPath);
    }
  }

  return assets.filter((asset) => {
    const normalized = normalizeWorkspaceImageReference(asset.asset.relativePath);
    return normalized !== undefined && !referencedPaths.has(normalized);
  });
}
