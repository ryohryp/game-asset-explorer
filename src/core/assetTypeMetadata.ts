import { isAssetSubtypeAllowed, isAssetTypeAllowed, type AssetProfile } from "./assetProfiles";
import { isSupportedAssetPath } from "./assetScanner";

export const ASSET_TYPE_METADATA_PATH = ".game-asset-explorer/asset-types.json";

export interface AssetTypeMetadataFile {
  schemaVersion: 1;
  assignments: Record<string, string>;
  subtypes?: Record<string, string>;
  characters?: Record<string, string>;
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
  if (value.subtypes !== undefined && !isPlainObject(value.subtypes)) {
    throw new AssetTypeMetadataError("Asset subtype metadata must be an object when present.");
  }
  if (value.characters !== undefined && !isPlainObject(value.characters)) {
    throw new AssetTypeMetadataError("Character metadata must be an object when present.");
  }

  const assignments = parsePathStringRecord(value.assignments, "Asset type", validateAssetTypeValue);
  const subtypes = isPlainObject(value.subtypes)
    ? parsePathStringRecord(value.subtypes, "Asset subtype", validateAssetSubtypeValue)
    : {};
  const characters = isPlainObject(value.characters)
    ? parsePathStringRecord(value.characters, "Character", normalizeCharacterName)
    : {};

  return {
    schemaVersion: 1,
    assignments,
    ...(Object.keys(subtypes).length > 0 ? { subtypes } : {}),
    ...(Object.keys(characters).length > 0 ? { characters } : {}),
  };
}

export function serializeAssetTypeMetadata(metadata: AssetTypeMetadataFile): string {
  const assignments = sortRecord(metadata.assignments);
  const subtypes = sortRecord(metadata.subtypes ?? {});
  const characters = sortRecord(metadata.characters ?? {});
  const payload = {
    schemaVersion: 1,
    assignments,
    ...(Object.keys(subtypes).length > 0 ? { subtypes } : {}),
    ...(Object.keys(characters).length > 0 ? { characters } : {}),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function getAssetTypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  profile: AssetProfile,
): string | undefined {
  const assignedType = metadata.assignments[normalizeAssetPath(relativePath)];
  return assignedType && isAssetTypeAllowed(profile, assignedType) ? assignedType : undefined;
}

export function getAssetSubtypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  profile: AssetProfile,
): string | undefined {
  const normalizedPath = normalizeAssetPath(relativePath);
  const assetType = getAssetTypeAssignment(metadata, normalizedPath, profile);
  const subtype = metadata.subtypes?.[normalizedPath];
  return assetType && subtype && isAssetSubtypeAllowed(profile, assetType, subtype) ? subtype : undefined;
}

export function setAssetTypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  assetType: string | undefined,
  profile: AssetProfile,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  validateAssignmentPath(normalizedPath, "Asset type");
  if (assetType !== undefined && !isAssetTypeAllowed(profile, assetType)) {
    throw new AssetTypeMetadataError(`Asset type '${assetType}' is not available in the active ${profile.label} profile.`);
  }

  const assignments = { ...metadata.assignments };
  if (assetType === undefined) {
    delete assignments[normalizedPath];
  } else {
    assignments[normalizedPath] = assetType;
  }

  const subtypes = { ...(metadata.subtypes ?? {}) };
  const existingSubtype = subtypes[normalizedPath];
  if (existingSubtype && (assetType === undefined || !isAssetSubtypeAllowed(profile, assetType, existingSubtype))) {
    delete subtypes[normalizedPath];
  }

  const result: AssetTypeMetadataFile = { ...metadata, schemaVersion: 1, assignments };
  if (Object.keys(subtypes).length > 0) {
    result.subtypes = subtypes;
  } else {
    delete result.subtypes;
  }
  return result;
}

export function setAssetSubtypeAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  subtype: string | undefined,
  profile: AssetProfile,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  validateAssignmentPath(normalizedPath, "Asset subtype");
  const assetType = getAssetTypeAssignment(metadata, normalizedPath, profile);
  if (!assetType && subtype !== undefined) {
    throw new AssetTypeMetadataError("Assign an Asset Type before assigning an Asset Subtype.");
  }
  if (subtype !== undefined && assetType && !isAssetSubtypeAllowed(profile, assetType, subtype)) {
    throw new AssetTypeMetadataError(
      `Asset subtype '${subtype}' is not available for Asset Type '${assetType}' in the active ${profile.label} profile.`,
    );
  }

  const subtypes = { ...(metadata.subtypes ?? {}) };
  if (subtype === undefined) {
    delete subtypes[normalizedPath];
  } else {
    subtypes[normalizedPath] = subtype;
  }

  const result: AssetTypeMetadataFile = { ...metadata, schemaVersion: 1 };
  if (Object.keys(subtypes).length > 0) {
    result.subtypes = subtypes;
  } else {
    delete result.subtypes;
  }
  return result;
}

export function getAssetCharacterAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
): string | undefined {
  return metadata.characters?.[normalizeAssetPath(relativePath)];
}

export function setAssetCharacterAssignment(
  metadata: AssetTypeMetadataFile,
  relativePath: string,
  character: string | undefined,
): AssetTypeMetadataFile {
  const normalizedPath = normalizeAssetPath(relativePath);
  validateAssignmentPath(normalizedPath, "Character");
  const characters = { ...(metadata.characters ?? {}) };

  if (character === undefined) {
    delete characters[normalizedPath];
  } else {
    characters[normalizedPath] = normalizeCharacterName(character);
  }

  const result: AssetTypeMetadataFile = { ...metadata, schemaVersion: 1 };
  if (Object.keys(characters).length > 0) {
    result.characters = characters;
  } else {
    delete result.characters;
  }
  return result;
}

export function normalizeCharacterName(value: string): string {
  const character = value.trim();
  if (!character || character.length > 64) {
    throw new AssetTypeMetadataError("Character names must be between 1 and 64 characters.");
  }
  if (/[\u0000-\u001f\u007f]/.test(character)) {
    throw new AssetTypeMetadataError("Character names must not contain control characters.");
  }
  return character;
}

function parsePathStringRecord(
  value: Record<string, unknown>,
  label: string,
  normalizeValue: (value: string) => string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawPath, rawValue] of Object.entries(value)) {
    const relativePath = normalizeAssetPath(rawPath);
    validateMetadataAssetPath(relativePath, rawPath);
    if (typeof rawValue !== "string") {
      throw new AssetTypeMetadataError(`${label} for '${rawPath}' must be a string.`);
    }
    if (result[relativePath] !== undefined) {
      throw new AssetTypeMetadataError(`Duplicate normalized asset path '${relativePath}' in ${label.toLowerCase()} metadata.`);
    }
    result[relativePath] = normalizeValue(rawValue);
  }
  return result;
}

function validateAssetTypeValue(value: string): string {
  const assetType = value.trim();
  if (!assetType || assetType.length > 64) {
    throw new AssetTypeMetadataError("Asset types must be between 1 and 64 characters.");
  }
  return assetType;
}

function validateAssetSubtypeValue(value: string): string {
  const subtype = value.trim();
  if (!subtype || subtype.length > 64) {
    throw new AssetTypeMetadataError("Asset subtypes must be between 1 and 64 characters.");
  }
  if (/[\u0000-\u001f\u007f]/.test(subtype)) {
    throw new AssetTypeMetadataError("Asset subtypes must not contain control characters.");
  }
  return subtype;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function validateMetadataAssetPath(relativePath: string, rawPath: string): void {
  if (!isSafeWorkspaceRelativeAssetPath(relativePath) || !isSupportedAssetPath(relativePath)) {
    throw new AssetTypeMetadataError(`Invalid asset path '${rawPath}' in asset type metadata.`);
  }
}

function validateAssignmentPath(relativePath: string, label: string): void {
  if (!isSafeWorkspaceRelativeAssetPath(relativePath) || !isSupportedAssetPath(relativePath)) {
    throw new AssetTypeMetadataError(`${label} assignments require a supported workspace-relative image path.`);
  }
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
