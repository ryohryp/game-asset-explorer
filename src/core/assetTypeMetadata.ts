import { isAssetTypeAllowed, type AssetProfile } from "./assetProfiles";
import { isSupportedAssetPath } from "./assetScanner";

export const ASSET_TYPE_METADATA_PATH = ".game-asset-explorer/asset-types.json";
export const MAX_CHARACTER_NAME_LENGTH = 80;

export interface AssetTypeMetadataFile {
  schemaVersion: 1;
  assignments: Record<string, string>;
  characters: Record<string, string>;
}

export class AssetTypeMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetTypeMetadataError";
  }
}

export function createEmptyAssetTypeMetadata(): AssetTypeMetadataFile {
  return { schemaVersion: 1, assignments: {}, characters: {} };
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
  if (value.characters !== undefined && !isPlainObject(value.characters)) {
    throw new AssetTypeMetadataError("Asset character metadata must be an object when present.");
  }

  const assignments: Record<string, string> = {};
  for (const [rawPath, rawType] of Object.entries(value.assignments)) {
    const relativePath = validateMetadataAssetPath(rawPath, "asset type");
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

  const characters: Record<string, string> = {};
  for (const [rawPath, rawCharacter] of Object.entries(value.characters ?? {})) {
    const relativePath = validateMetadataAssetPath(rawPath, "character");
    if (typeof rawCharacter !== "string") {
      throw new AssetTypeMetadataError(`Character for '${rawPath}' must be a string.`);
    }
    const character = normalizeCharacterName(rawCharacter);
    if (characters[relativePath] !== undefined) {
      throw new AssetTypeMetadataError(`Duplicate normalized asset path '${relativePath}' in character metadata.`);
    }
    characters[relativePath] = character;
  }

  return { schemaVersion: 1, assignments, characters };
}

export function serializeAssetTypeMetadata(metadata: AssetTypeMetadataFile): string {
  const assignments = sortRecord(metadata.assignments);
  const characters = sortRecord(metadata.characters);
  return `${JSON.stringify({ schemaVersion: 1, assignments, ...(Object.keys(characters).length > 0 ? { characters } : {}) }, null, 2)}\n`;
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
  return { schemaVersion: 1, assignments, characters: { ...metadata.characters } };
}

export function getCharacterAssignment(metadata: AssetTypeMetadataFile, relativePath: string): string | undefined {
  return metadata.characters[normalizeAssetPath(relativePath)];
}

export function setCharacterAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  character: string | undefined,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  if (!isSafeWorkspaceRelativeAssetPath(normalizedPath) || !isSupportedAssetPath(normalizedPath)) {
    throw new AssetTypeMetadataError("Character assignments require a supported workspace-relative image path.");
  }

  const characters = { ...metadata.characters };
  if (character === undefined || !character.trim()) {
    delete characters[normalizedPath];
  } else {
    characters[normalizedPath] = normalizeCharacterName(character);
  }
  return { schemaVersion: 1, assignments: { ...metadata.assignments }, characters };
}

function normalizeCharacterName(value: string): string {
  const character = value.trim();
  if (!character || character.length > MAX_CHARACTER_NAME_LENGTH || /[\r\n\t]/.test(character)) {
    throw new AssetTypeMetadataError(`Character must be between 1 and ${MAX_CHARACTER_NAME_LENGTH} printable characters.`);
  }
  return character;
}

function validateMetadataAssetPath(rawPath: string, label: string): string {
  const relativePath = normalizeAssetPath(rawPath);
  if (!isSafeWorkspaceRelativeAssetPath(relativePath) || !isSupportedAssetPath(relativePath)) {
    throw new AssetTypeMetadataError(`Invalid asset path '${rawPath}' in ${label} metadata.`);
  }
  return relativePath;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
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
