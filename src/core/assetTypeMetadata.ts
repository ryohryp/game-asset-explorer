import { isAssetTypeAllowed, type AssetProfile } from "./assetProfiles";
import { isSupportedAssetPath } from "./assetScanner";

export const ASSET_TYPE_METADATA_PATH = ".game-asset-explorer/asset-types.json";

export interface AssetTypeMetadataFile {
  schemaVersion: 1;
  assignments: Record<string, string>;
}

export class AssetTypeMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetTypeMetadataError";
  }
}

export function createEmptyAssetTypeMetadata(): AssetTypeMetadataFile {
  return { schemaVersion: 1, assignments: {} };
}

export function parseAssetTypeMetadata(text: string): AssetTypeMetadataFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AssetTypeMetadataError("Asset type metadata must be valid JSON.");
  }

  if (!isPlainObject(value) || value.schemaVersion !== 1 || !isPlainObject(value.assignments)) {
    throw new AssetTypeMetadataError("Asset type metadata must use schemaVersion 1 and an assignments object.");
  }

  const assignments: Record<string, string> = {};
  for (const [rawPath, rawType] of Object.entries(value.assignments)) {
    const relativePath = normalizeAssetPath(rawPath);
    if (!isSafeWorkspaceRelativeAssetPath(relativePath) || !isSupportedAssetPath(relativePath)) {
      throw new AssetTypeMetadataError(`Invalid asset path '${rawPath}' in asset type metadata.`);
    }
    if (typeof rawType !== "string") {
      throw new AssetTypeMetadataError(`Asset type for '${rawPath}' must be a string.`);
    }

    const assetType = rawType.trim();
    if (!assetType || assetType.length > 64) {
      throw new AssetTypeMetadataError(`Asset type for '${rawPath}' must be between 1 and 64 characters.`);
    }
    if (assignments[relativePath] !== undefined) {
      throw new AssetTypeMetadataError(`Duplicate normalized asset path '${relativePath}' in asset type metadata.`);
    }
    assignments[relativePath] = assetType;
  }

  return { schemaVersion: 1, assignments };
}

export function serializeAssetTypeMetadata(metadata: AssetTypeMetadataFile): string {
  const assignments = Object.fromEntries(
    Object.entries(metadata.assignments).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify({ schemaVersion: 1, assignments }, null, 2)}\n`;
}

export function getAssetTypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  profile: AssetProfile,
): string | undefined {
  const assignedType = metadata.assignments[normalizeAssetPath(relativePath)];
  return assignedType && isAssetTypeAllowed(profile, assignedType) ? assignedType : undefined;
}

export function setAssetTypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  assetType: string | undefined,
  profile: AssetProfile,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  if (!isSafeWorkspaceRelativeAssetPath(normalizedPath) || !isSupportedAssetPath(normalizedPath)) {
    throw new AssetTypeMetadataError("Asset type assignments require a supported workspace-relative image path.");
  }
  if (assetType !== undefined && !isAssetTypeAllowed(profile, assetType)) {
    throw new AssetTypeMetadataError(`Asset type '${assetType}' is not available in the active ${profile.label} profile.`);
  }

  const assignments = { ...metadata.assignments };
  if (assetType === undefined) {
    delete assignments[normalizedPath];
  } else {
    assignments[normalizedPath] = assetType;
  }
  return { schemaVersion: 1, assignments };
}

function normalizeAssetPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function isSafeWorkspaceRelativeAssetPath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return false;
  }
  return !value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
