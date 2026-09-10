import { isSupportedAssetPath } from "./assetScanner";

export type AssetUsageHealth =
  | { status: "referenced"; usageCount: number; evidence: "direct" }
  | { status: "unused-candidate"; usageCount: 0; evidence: "candidate" };

export interface DirectImageReference {
  raw: string;
  normalizedPath: string;
  startOffset: number;
  endOffset: number;
}

export function classifyAssetUsageHealth(usageCount: number): AssetUsageHealth {
  if (usageCount > 0) {
    return { status: "referenced", usageCount, evidence: "direct" };
  }
  return { status: "unused-candidate", usageCount: 0, evidence: "candidate" };
}

export function extractDirectImageReferences(text: string): DirectImageReference[] {
  const matches: DirectImageReference[] = [];
  const pattern = /(["'`])([^"'`\r\n]+)\1/g;

  for (const match of text.matchAll(pattern)) {
    const raw = match[2];
    if (!raw || raw.includes("${")) {
      continue;
    }

    const normalizedPath = normalizeWorkspaceImageReference(raw);
    if (!normalizedPath) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const startOffset = matchIndex + 1;
    matches.push({
      raw,
      normalizedPath,
      startOffset,
      endOffset: startOffset + raw.length,
    });
  }

  return matches;
}

export function normalizeWorkspaceImageReference(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("${")) {
    return undefined;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//") || trimmed.startsWith("../")) {
    return undefined;
  }

  const withoutPrefix = trimmed.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!withoutPrefix || withoutPrefix.startsWith("../") || !withoutPrefix.includes("/")) {
    return undefined;
  }

  const pathOnly = withoutPrefix.split(/[?#]/, 1)[0];
  if (!pathOnly || !isSupportedAssetPath(pathOnly)) {
    return undefined;
  }

  const segments = pathOnly.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return undefined;
  }

  return pathOnly;
}

export function findMissingDirectReferences(
  references: readonly DirectImageReference[],
  discoveredRelativePaths: readonly string[],
): DirectImageReference[] {
  const discovered = new Set(discoveredRelativePaths.map(normalizeComparablePath));
  return references.filter((reference) => !discovered.has(normalizeComparablePath(reference.normalizedPath)));
}

function normalizeComparablePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}
