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
import { findPotentiallyUnusedAssets } from "./core/potentiallyUnusedAssets";

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
): Promise<AssetHealthReport | undefined> {
  const workspaceFolder = getWorkspaceFolderForAsset(workspaceAsset);
  if (!workspaceFolder) {
    return undefined;
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

export async function findPotentiallyUnusedWorkspaceAssets(
  allAssets: readonly WorkspaceAsset[],
): Promise<WorkspaceAsset[]> {
  const results: WorkspaceAsset[] = [];
  const workspaceUris = [...new Set(allAssets.map((asset) => asset.workspaceFolderUri))];
  for (const workspaceFolderUri of workspaceUris) {
    const workspaceAssets = allAssets.filter((asset) => asset.workspaceFolderUri === workspaceFolderUri);
    const workspaceFolder = workspaceAssets[0] && getWorkspaceFolderForAsset(workspaceAssets[0]);
    if (!workspaceFolder) continue;
    const files = await readWorkspaceTextFiles(workspaceFolder);
    results.push(...findPotentiallyUnusedAssets(workspaceAssets, files.map((file) => file.text)));
  }
  return results;
}

export async function findMissingWorkspaceAssetReferences(
  allAssets: readonly WorkspaceAsset[],
): Promise<MissingAssetReference[]> {
  const results: MissingAssetReference[] = [];
  const workspaceUris = [...new Set(allAssets.map((asset) => asset.workspaceFolderUri))];
  for (const workspaceFolderUri of workspaceUris) {
    const workspaceAssets = allAssets.filter((asset) => asset.workspaceFolderUri === workspaceFolderUri);
    const workspaceFolder = workspaceAssets[0] && getWorkspaceFolderForAsset(workspaceAssets[0]);
    if (!workspaceFolder) continue;
    const files = await readWorkspaceTextFiles(workspaceFolder);
    const paths = workspaceAssets.map((asset) => asset.asset.relativePath);
    for (const file of files) {
      for (const reference of findMissingDirectReferences(extractDirectImageReferences(file.text), paths)) {
        const start = offsetToPosition(file.text, reference.startOffset);
        const end = offsetToPosition(file.text, reference.endOffset);
        results.push({ sourcePath: file.sourcePath, uri: file.uri.toString(), line: start.line, character: start.character, endLine: end.line, endCharacter: end.character, matchedText: reference.raw, targetPath: reference.normalizedPath, evidence: "direct" });
      }
    }
  }
  return results.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line || a.character - b.character);
}
