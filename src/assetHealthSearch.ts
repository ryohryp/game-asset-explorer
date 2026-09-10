import {
  classifyAssetUsageHealth,
  extractDirectImageReferences,
  findMissingDirectReferences,
  normalizeWorkspaceImageReference,
  type AssetUsageHealth,
} from "./core/assetHealth";
import {
  findAssetUsagesInTextFiles,
  getWorkspaceFolderForAsset,
  offsetToPosition,
  readWorkspaceTextFiles,
  type AssetUsage,
} from "./usageSearch";
import { type WorkspaceAsset } from "./workspaceAsset";

export interface MissingAssetReference extends AssetUsage {
  targetPath: string;
  evidence: "direct";
}

export interface AssetHealthReport {
  assetHealth: AssetUsageHealth;
  missingReferences: MissingAssetReference[];
}

export async function inspectWorkspaceAssetHealth(
  workspaceAsset: WorkspaceAsset,
  allAssets: readonly WorkspaceAsset[],
): Promise<AssetHealthReport> {
  const workspaceFolder = getWorkspaceFolderForAsset(workspaceAsset);
  if (!workspaceFolder) {
    return {
      assetHealth: classifyAssetUsageHealth(0),
      missingReferences: [],
    };
  }

  const files = await readWorkspaceTextFiles(workspaceFolder);
  const targetPath = normalizeWorkspaceImageReference(workspaceAsset.asset.relativePath);
  const directUsages = findAssetUsagesInTextFiles(workspaceAsset, files).filter((usage) => (
    targetPath !== undefined && normalizeWorkspaceImageReference(usage.matchedText) === targetPath
  ));
  const workspaceRelativePaths = allAssets
    .filter((asset) => asset.workspaceFolderUri === workspaceAsset.workspaceFolderUri)
    .map((asset) => asset.asset.relativePath);
  const missingReferences: MissingAssetReference[] = [];

  for (const file of files) {
    const missing = findMissingDirectReferences(
      extractDirectImageReferences(file.text),
      workspaceRelativePaths,
    );

    for (const reference of missing) {
      const start = offsetToPosition(file.text, reference.startOffset);
      const end = offsetToPosition(file.text, reference.endOffset);
      missingReferences.push({
        sourcePath: file.sourcePath,
        uri: file.uri.toString(),
        line: start.line,
        character: start.character,
        endLine: end.line,
        endCharacter: end.character,
        matchedText: reference.raw,
        targetPath: reference.normalizedPath,
        evidence: "direct",
      });
    }
  }

  missingReferences.sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.line - right.line
    || left.character - right.character
  ));

  return {
    assetHealth: classifyAssetUsageHealth(directUsages.length),
    missingReferences,
  };
}
