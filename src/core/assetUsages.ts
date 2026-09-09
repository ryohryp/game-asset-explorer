import { AssetRecord } from "./assetScanner";

export interface AssetUsageMatch {
  candidate: string;
  startOffset: number;
  endOffset: number;
}

export function getAssetUsageCandidates(asset: Pick<AssetRecord, "relativePath" | "fileName">): string[] {
  const normalizedPath = normalizeRelativePath(asset.relativePath);
  const candidates = [
    normalizedPath,
    normalizedPath ? `./${normalizedPath}` : "",
    normalizedPath ? `/${normalizedPath}` : "",
    asset.fileName,
  ].filter((candidate) => candidate.length > 0);

  return [...new Set(candidates)];
}

export function findAssetUsageMatches(
  text: string,
  candidates: readonly string[],
): AssetUsageMatch[] {
  const distinctCandidates = [...new Set(candidates.filter((candidate) => candidate.length > 0))]
    .sort((left, right) => right.length - left.length);
  const matches: AssetUsageMatch[] = [];

  for (const candidate of distinctCandidates) {
    let startOffset = 0;
    while (startOffset <= text.length - candidate.length) {
      const foundOffset = text.indexOf(candidate, startOffset);
      if (foundOffset === -1) {
        break;
      }

      const endOffset = foundOffset + candidate.length;
      const containedByExistingMatch = matches.some((match) => (
        foundOffset >= match.startOffset && endOffset <= match.endOffset
      ));

      if (!containedByExistingMatch) {
        matches.push({ candidate, startOffset: foundOffset, endOffset });
      }

      startOffset = foundOffset + Math.max(candidate.length, 1);
    }
  }

  return matches.sort((left, right) => left.startOffset - right.startOffset);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}
