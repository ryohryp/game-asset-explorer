import type { WorkspaceAsset } from "../workspaceAsset";

export type FolderOrganizationFindingKind =
  | "scattered-character"
  | "mixed-asset-types"
  | "deep-nesting"
  | "one-off-folder";

export type MetadataHygieneFindingKind = "uncategorized-assets";

export type FolderOrganizationFindingConfidence = "low" | "medium" | "high";
export type FolderOrganizationFindingSeverity = "info" | "warning";

export interface FolderOrganizationAssetRef {
  workspaceFolderUri: string;
  workspaceFolderName: string;
  relativePath: string;
  assetType?: string;
  character?: string;
}

export interface FolderOrganizationFinding {
  kind: FolderOrganizationFindingKind;
  workspaceFolderUri: string;
  workspaceFolderName: string;
  title: string;
  reason: string;
  affectedFolders: string[];
  affectedAssets: FolderOrganizationAssetRef[];
  suggestedTargetFolder?: string;
  confidence?: FolderOrganizationFindingConfidence;
  severity?: FolderOrganizationFindingSeverity;
}

export interface MetadataHygieneFinding {
  kind: MetadataHygieneFindingKind;
  workspaceFolderUri: string;
  workspaceFolderName: string;
  title: string;
  reason: string;
  affectedFolders: string[];
  affectedAssets: FolderOrganizationAssetRef[];
}

export interface FolderOrganizationReport {
  analyzedAssets: number;
  findings: FolderOrganizationFinding[];
  metadataFindings: MetadataHygieneFinding[];
  thresholds: {
    mixedFolderMinimumAssets: number;
    mixedFolderMinimumPerType: number;
    deepFolderMinimumDepth: number;
    oneOffFolderMinimumDepth: number;
    uncategorizedMinimumAssets: number;
    uncategorizedMinimumRatio: number;
  };
}

export const FOLDER_ORGANIZATION_THRESHOLDS = {
  mixedFolderMinimumAssets: 4,
  mixedFolderMinimumPerType: 2,
  deepFolderMinimumDepth: 5,
  oneOffFolderMinimumDepth: 3,
  uncategorizedMinimumAssets: 4,
  uncategorizedMinimumRatio: 0.75,
} as const;

export function analyzeFolderOrganization(assets: readonly WorkspaceAsset[]): FolderOrganizationReport {
  const findings: FolderOrganizationFinding[] = [];
  const metadataFindings: MetadataHygieneFinding[] = [];
  const byWorkspace = groupBy(assets, (asset) => asset.workspaceFolderUri);

  for (const workspaceAssets of byWorkspace.values()) {
    if (workspaceAssets.length === 0) continue;
    findings.push(...analyzeWorkspace(workspaceAssets));
    metadataFindings.push(...analyzeWorkspaceMetadata(workspaceAssets));
  }

  findings.sort((left, right) =>
    left.workspaceFolderName.localeCompare(right.workspaceFolderName)
    || findingRank(left.kind) - findingRank(right.kind)
    || left.title.localeCompare(right.title),
  );

  metadataFindings.sort((left, right) =>
    left.workspaceFolderName.localeCompare(right.workspaceFolderName)
    || left.title.localeCompare(right.title),
  );

  return {
    analyzedAssets: assets.length,
    findings,
    metadataFindings,
    thresholds: { ...FOLDER_ORGANIZATION_THRESHOLDS },
  };
}

function analyzeWorkspace(assets: readonly WorkspaceAsset[]): FolderOrganizationFinding[] {
  const findings: FolderOrganizationFinding[] = [];
  const workspaceFolderUri = assets[0].workspaceFolderUri;
  const workspaceFolderName = assets[0].workspaceFolderName;
  const byFolder = groupBy(assets, (asset) => folderOf(asset.asset.relativePath));

  const byCharacter = new Map<string, WorkspaceAsset[]>();
  for (const asset of assets) {
    if (!asset.character) continue;
    const list = byCharacter.get(asset.character) ?? [];
    list.push(asset);
    byCharacter.set(asset.character, list);
  }

  for (const [character, characterAssets] of byCharacter) {
    const folders = uniqueSorted(characterAssets.map((asset) => folderOf(asset.asset.relativePath)));
    if (folders.length < 2 || characterAssets.length < 2) continue;
    const types = uniqueSorted(characterAssets.map((asset) => asset.assetType).filter(isString));
    const target = suggestedCharacterTarget(characterAssets, character, types.length === 1 ? types[0] : undefined);
    findings.push({
      kind: "scattered-character",
      workspaceFolderUri,
      workspaceFolderName,
      title: `${character} is spread across ${folders.length} folders`,
      reason: `${characterAssets.length} assets explicitly assigned to ${character} are stored in multiple folders. Consolidating them may make character work easier.`,
      affectedFolders: folders,
      affectedAssets: characterAssets.map(toAssetRef).sort(compareAssetRef),
      ...(target ? { suggestedTargetFolder: target } : {}),
    });
  }

  for (const [folder, folderAssets] of byFolder) {
    const assignedTypes = folderAssets.map((asset) => asset.assetType).filter(isString);
    const typeCounts = countValues(assignedTypes);
    const significantTypes = [...typeCounts.entries()].filter(([, count]) => count >= FOLDER_ORGANIZATION_THRESHOLDS.mixedFolderMinimumPerType);
    if (
      folderAssets.length >= FOLDER_ORGANIZATION_THRESHOLDS.mixedFolderMinimumAssets
      && significantTypes.length >= 2
    ) {
      findings.push({
        kind: "mixed-asset-types",
        workspaceFolderUri,
        workspaceFolderName,
        title: `${displayFolder(folder)} mixes multiple Asset Types`,
        reason: `${folderAssets.length} assets are in this folder and at least ${FOLDER_ORGANIZATION_THRESHOLDS.mixedFolderMinimumPerType} assets belong to each of ${significantTypes.length} Asset Types (${significantTypes.map(([type, count]) => `${type}: ${count}`).join(", ")}).`,
        affectedFolders: [folder],
        affectedAssets: folderAssets.map(toAssetRef).sort(compareAssetRef),
      });
    }

    const depth = folderDepth(folder);
    const effectiveDepth = effectiveFolderDepth(folder);
    if (effectiveDepth >= FOLDER_ORGANIZATION_THRESHOLDS.deepFolderMinimumDepth) {
      findings.push({
        kind: "deep-nesting",
        workspaceFolderUri,
        workspaceFolderName,
        title: `${displayFolder(folder)} is deeply nested`,
        reason: `This folder is ${depth} levels deep (${effectiveDepth} structural levels after ignoring version-like segments such as v1/v2). The conservative warning threshold is ${FOLDER_ORGANIZATION_THRESHOLDS.deepFolderMinimumDepth} structural levels.`,
        affectedFolders: [folder],
        affectedAssets: folderAssets.map(toAssetRef).sort(compareAssetRef),
      });
    }
  }

  const folders = [...byFolder.keys()];
  for (const folder of folders) {
    const folderAssets = byFolder.get(folder) ?? [];
    const depth = folderDepth(folder);
    if (folderAssets.length !== 1 || depth < FOLDER_ORGANIZATION_THRESHOLDS.oneOffFolderMinimumDepth) continue;
    const parent = parentFolder(folder);
    const siblingFolders = folders.filter((candidate) => candidate !== folder && parentFolder(candidate) === parent);
    if (siblingFolders.length === 0) continue;
    if (looksLikePeerNamespaceFolder(folder, folders, byFolder)) continue;
    findings.push({
      kind: "one-off-folder",
      workspaceFolderUri,
      workspaceFolderName,
      title: `${displayFolder(folder)} contains only one asset`,
      reason: `This leaf folder is ${depth} levels deep, contains one image asset, and has sibling folders. It may add navigation depth, but it may also represent an intentional domain boundary. Review project conventions and references before reorganizing it.`,
      confidence: "low",
      severity: "info",
      affectedFolders: [folder],
      affectedAssets: folderAssets.map(toAssetRef),
    });
  }

  return findings;
}

function analyzeWorkspaceMetadata(assets: readonly WorkspaceAsset[]): MetadataHygieneFinding[] {
  const findings: MetadataHygieneFinding[] = [];
  if (assets.length === 0) return findings;
  const workspaceFolderUri = assets[0].workspaceFolderUri;
  const workspaceFolderName = assets[0].workspaceFolderName;
  const byFolder = groupBy(assets, (asset) => folderOf(asset.asset.relativePath));

  for (const [folder, folderAssets] of byFolder) {
    const uncategorized = folderAssets.filter((asset) => !asset.assetType);
    if (
      folderAssets.length >= FOLDER_ORGANIZATION_THRESHOLDS.uncategorizedMinimumAssets
      && uncategorized.length >= FOLDER_ORGANIZATION_THRESHOLDS.uncategorizedMinimumAssets
      && uncategorized.length / folderAssets.length >= FOLDER_ORGANIZATION_THRESHOLDS.uncategorizedMinimumRatio
    ) {
      findings.push({
        kind: "uncategorized-assets",
        workspaceFolderUri,
        workspaceFolderName,
        title: `${displayFolder(folder)} has many Uncategorized assets`,
        reason: `${uncategorized.length} of ${folderAssets.length} assets (${Math.round(uncategorized.length / folderAssets.length * 100)}%) have no explicit Asset Type. This is a metadata hygiene finding, not a recommendation to move files; no semantic type is inferred.`,
        affectedFolders: [folder],
        affectedAssets: uncategorized.map(toAssetRef).sort(compareAssetRef),
      });
    }
  }

  return findings;
}

function suggestedCharacterTarget(assets: readonly WorkspaceAsset[], character: string, assetType?: string): string | undefined {
  const roots = uniqueSorted(assets.map((asset) => firstSegment(asset.asset.relativePath)).filter(isString));
  if (roots.length !== 1) return undefined;
  const characterSegment = slugSegment(character);
  if (!characterSegment) return undefined;
  const base = `${roots[0]}/characters/${characterSegment}`;
  if (!assetType) return base;
  const typeSegment = slugSegment(assetType);
  return typeSegment ? `${base}/${typeSegment}` : base;
}

function folderOf(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length <= 1 ? "" : parts.slice(0, -1).join("/");
}

function firstSegment(relativePath: string): string | undefined {
  const parts = relativePath.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : undefined;
}

function folderDepth(folder: string): number {
  return folder ? folder.split("/").filter(Boolean).length : 0;
}

function effectiveFolderDepth(folder: string): number {
  return folder ? folder.split("/").filter((segment) => segment.length > 0 && !isVersionLikeSegment(segment)).length : 0;
}

function isVersionLikeSegment(segment: string): boolean {
  return /^v\d+(?:[._-]\d+)*$/i.test(segment);
}

function looksLikePeerNamespaceFolder(
  folder: string,
  folders: readonly string[],
  byFolder: ReadonlyMap<string, WorkspaceAsset[]>,
): boolean {
  const parent = parentFolder(folder);
  const peers = folders.filter((candidate) => parentFolder(candidate) === parent);
  if (peers.length < 3) return false;

  return peers.every((peer) => {
    const directAssets = byFolder.get(peer) ?? [];
    if (directAssets.length === 0 || directAssets.length > 2) return false;
    const prefix = `${peer}/`;
    return !folders.some((candidate) => candidate !== peer && candidate.startsWith(prefix));
  });
}

function parentFolder(folder: string): string {
  const parts = folder.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function displayFolder(folder: string): string {
  return folder || "Workspace root";
}

function slugSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function toAssetRef(asset: WorkspaceAsset): FolderOrganizationAssetRef {
  return {
    workspaceFolderUri: asset.workspaceFolderUri,
    workspaceFolderName: asset.workspaceFolderName,
    relativePath: asset.asset.relativePath,
    ...(asset.assetType ? { assetType: asset.assetType } : {}),
    ...(asset.character ? { character: asset.character } : {}),
  };
}

function compareAssetRef(left: FolderOrganizationAssetRef, right: FolderOrganizationAssetRef): number {
  return left.relativePath.localeCompare(right.relativePath);
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function findingRank(kind: FolderOrganizationFindingKind): number {
  return ["scattered-character", "mixed-asset-types", "deep-nesting", "one-off-folder"].indexOf(kind);
}
