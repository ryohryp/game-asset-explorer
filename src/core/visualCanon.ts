import {
  isSafeWorkspaceRelativePath,
  normalizeWorkspacePath,
  type GenerationAssetKind,
  type GenerationContext,
  type GenerationReference,
} from "./generationPackage";
import { isSupportedAssetPath } from "./assetScanner";

export const VISUAL_CANON_PATH = ".game-asset-explorer/visual-canon.json";

export interface VisualCanonEntry {
  id: string;
  kind: GenerationAssetKind;
  anchors: string[];
  constraints?: string[];
  forbidden?: string[];
}

export interface VisualCanonFile {
  schemaVersion: 1;
  entries: VisualCanonEntry[];
}

export interface ResolvedVisualCanonContext {
  entry: VisualCanonEntry;
  references: GenerationReference[];
  context: GenerationContext;
}

export class VisualCanonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualCanonError";
  }
}

export function parseVisualCanon(text: string): VisualCanonFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new VisualCanonError("Visual Canon must be valid JSON.");
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    throw new VisualCanonError("Visual Canon must use schemaVersion 1 and contain an entries array.");
  }

  const ids = new Set<string>();
  const entries = value.entries.map((raw, index) => parseEntry(raw, index));
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new VisualCanonError(`Visual Canon id '${entry.id}' is duplicated.`);
    }
    ids.add(entry.id);
  }
  return { schemaVersion: 1, entries };
}

export function findVisualCanonEntriesForAsset(
  canon: VisualCanonFile,
  relativePath: string,
): VisualCanonEntry[] {
  const target = normalizeWorkspacePath(relativePath);
  return canon.entries.filter((entry) => entry.anchors.includes(target));
}

export function resolveVisualCanonEntry(
  canon: VisualCanonFile,
  id: string,
  availableAssetPaths: readonly string[],
): ResolvedVisualCanonContext {
  const entry = canon.entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new VisualCanonError(`Visual Canon entry '${id}' was not found.`);
  }
  const available = new Set(availableAssetPaths.map(normalizeWorkspacePath));
  const missing = entry.anchors.filter((anchor) => !available.has(anchor));
  if (missing.length > 0) {
    throw new VisualCanonError(`Visual Canon entry '${id}' has missing anchor: ${missing[0]}`);
  }

  return {
    entry,
    references: entry.anchors.map((relativePath) => ({ relativePath, role: "style", required: true })),
    context: {
      subjectId: entry.id,
      ...(entry.constraints?.length ? { constraints: [...entry.constraints] } : {}),
      ...(entry.forbidden?.length ? { forbidden: [...entry.forbidden] } : {}),
    },
  };
}

function parseEntry(value: unknown, index: number): VisualCanonEntry {
  if (!isRecord(value)) {
    throw new VisualCanonError(`Visual Canon entry ${index} must be an object.`);
  }
  const id = stringValue(value.id);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new VisualCanonError(`Visual Canon entry ${index} has an invalid id.`);
  }
  const kind = value.kind;
  if (!isAssetKind(kind)) {
    throw new VisualCanonError(`Visual Canon entry '${id}' has an invalid kind.`);
  }
  if (!Array.isArray(value.anchors) || value.anchors.length === 0) {
    throw new VisualCanonError(`Visual Canon entry '${id}' requires at least one anchor.`);
  }
  const anchors = value.anchors.map((anchor, anchorIndex) => {
    const normalized = normalizeWorkspacePath(stringValue(anchor));
    if (!isSafeWorkspaceRelativePath(normalized) || !isSupportedAssetPath(normalized)) {
      throw new VisualCanonError(`Visual Canon entry '${id}' anchor ${anchorIndex} must be a safe workspace-relative image path.`);
    }
    return normalized;
  });

  return {
    id,
    kind,
    anchors,
    ...optionalTextList(value.constraints, "constraints", id),
    ...optionalTextList(value.forbidden, "forbidden", id),
  };
}

function optionalTextList(value: unknown, field: "constraints" | "forbidden", id: string): Partial<VisualCanonEntry> {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new VisualCanonError(`Visual Canon entry '${id}' ${field} must be a string array.`);
  }
  const values = value.map((item) => item.trim()).filter(Boolean);
  return values.length ? { [field]: values } : {};
}

function isAssetKind(value: unknown): value is GenerationAssetKind {
  return value === "character" || value === "environment" || value === "ui" || value === "item" || value === "effect" || value === "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
