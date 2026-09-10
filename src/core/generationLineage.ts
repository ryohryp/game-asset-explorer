import {
  isSafeWorkspaceRelativePath,
  normalizeWorkspacePath,
  type GenerationIntent,
  type GenerationPackage,
} from "./generationPackage";
import type { GenerationInvocationReceipt } from "./imageGenerationProvider";

export const GENERATION_LINEAGE_PATH = ".game-asset-explorer/lineage.json";

export type GenerationLineageRelationship = "variant_of" | "generated_from";
export type GenerationLineageApprovalStatus = "approved";

export interface GenerationLineageRecord {
  assetPath: string;
  relationship: GenerationLineageRelationship;
  sourcePaths: string[];
  intent: GenerationIntent;
  providerId: string;
  model?: string;
  generationPackage: GenerationPackage;
  createdAt: string;
  approvalStatus: GenerationLineageApprovalStatus;
}

export interface GenerationLineageDocument {
  schemaVersion: 1;
  records: GenerationLineageRecord[];
}

export class GenerationLineageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationLineageError";
  }
}

export function createApprovedGenerationLineageRecord(
  receipt: GenerationInvocationReceipt,
  candidateId: string,
  createdAt: string,
): GenerationLineageRecord {
  if (!receipt.candidates.some((candidate) => candidate.id === candidateId)) {
    throw new GenerationLineageError(`Unknown approved generation candidate: ${candidateId}`);
  }

  const generationPackage = receipt.generationPackage;
  const assetPath = normalizeAndAssertSafePath(
    generationPackage.output.relativePath,
    "generationPackage.output.relativePath",
  );
  const sourcePaths = generationPackage.references
    .filter((reference) => reference.required)
    .map((reference, index) => normalizeAndAssertSafePath(
      reference.relativePath,
      `generationPackage.references[${index}].relativePath`,
    ));

  if (sourcePaths.length === 0) {
    throw new GenerationLineageError(
      "Approved generated asset must retain at least one required source/reference path.",
    );
  }

  const providerId = receipt.providerId.trim();
  if (!providerId) {
    throw new GenerationLineageError("Generation provider id is required.");
  }

  return {
    assetPath,
    relationship: generationPackage.intent === "variant" ? "variant_of" : "generated_from",
    sourcePaths: uniqueSorted(sourcePaths),
    intent: generationPackage.intent,
    providerId,
    ...(receipt.model?.trim() ? { model: receipt.model.trim() } : {}),
    generationPackage,
    createdAt: normalizeTimestamp(createdAt),
    approvalStatus: "approved",
  };
}

export function parseGenerationLineage(text: string): GenerationLineageDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GenerationLineageError("Lineage metadata must be valid JSON.");
  }

  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.records)) {
    throw new GenerationLineageError("Unsupported or invalid lineage metadata schema.");
  }

  const records = value.records.map((record, index) => parseRecord(record, index));
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.assetPath)) {
      throw new GenerationLineageError(`Duplicate lineage record for asset: ${record.assetPath}`);
    }
    seen.add(record.assetPath);
  }

  return { schemaVersion: 1, records };
}

export function serializeGenerationLineage(document: GenerationLineageDocument): string {
  const validated = parseGenerationLineage(JSON.stringify(document));
  const normalized: GenerationLineageDocument = {
    schemaVersion: 1,
    records: [...validated.records]
      .map((record) => ({ ...record, sourcePaths: uniqueSorted(record.sourcePaths) }))
      .sort((a, b) => a.assetPath.localeCompare(b.assetPath)),
  };

  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function parseRecord(value: unknown, index: number): GenerationLineageRecord {
  if (!isRecord(value)) {
    throw new GenerationLineageError(`records[${index}] must be an object.`);
  }

  const assetPath = normalizeAndAssertSafePath(
    readString(value.assetPath, `records[${index}].assetPath`),
    `records[${index}].assetPath`,
  );

  const relationship = value.relationship;
  if (relationship !== "variant_of" && relationship !== "generated_from") {
    throw new GenerationLineageError(`records[${index}].relationship is invalid.`);
  }

  if (!Array.isArray(value.sourcePaths) || value.sourcePaths.length === 0) {
    throw new GenerationLineageError(
      `records[${index}].sourcePaths must contain at least one path.`,
    );
  }

  const sourcePaths = uniqueSorted(value.sourcePaths.map((path, sourceIndex) =>
    normalizeAndAssertSafePath(
      readString(path, `records[${index}].sourcePaths[${sourceIndex}]`),
      `records[${index}].sourcePaths[${sourceIndex}]`,
    ),
  ));

  const intent = value.intent;
  if (intent !== "new-asset" && intent !== "variant" && intent !== "edit") {
    throw new GenerationLineageError(`records[${index}].intent is invalid.`);
  }

  const providerId = readString(value.providerId, `records[${index}].providerId`).trim();
  if (!providerId) {
    throw new GenerationLineageError(`records[${index}].providerId is required.`);
  }

  const generationPackage = value.generationPackage;
  if (!isGenerationPackage(generationPackage)) {
    throw new GenerationLineageError(`records[${index}].generationPackage is invalid.`);
  }

  const packageOutput = normalizeAndAssertSafePath(
    generationPackage.output.relativePath,
    `records[${index}].generationPackage.output.relativePath`,
  );
  if (packageOutput !== assetPath) {
    throw new GenerationLineageError(
      `records[${index}] assetPath must match the Generation Package output path.`,
    );
  }

  for (const [referenceIndex, reference] of generationPackage.references.entries()) {
    normalizeAndAssertSafePath(
      reference.relativePath,
      `records[${index}].generationPackage.references[${referenceIndex}].relativePath`,
    );
  }

  if (generationPackage.intent !== intent) {
    throw new GenerationLineageError(
      `records[${index}] intent must match the Generation Package intent.`,
    );
  }

  if (value.approvalStatus !== "approved") {
    throw new GenerationLineageError(
      `records[${index}].approvalStatus must be approved.`,
    );
  }

  const model = typeof value.model === "string" && value.model.trim()
    ? value.model.trim()
    : undefined;

  return {
    assetPath,
    relationship,
    sourcePaths,
    intent,
    providerId,
    ...(model ? { model } : {}),
    generationPackage,
    createdAt: normalizeTimestamp(
      readString(value.createdAt, `records[${index}].createdAt`),
    ),
    approvalStatus: "approved",
  };
}

function isGenerationPackage(value: unknown): value is GenerationPackage {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.assetKind === "string"
    && typeof value.intent === "string"
    && typeof value.userRequest === "string"
    && Array.isArray(value.references)
    && value.references.every((reference) =>
      isRecord(reference)
      && typeof reference.relativePath === "string"
      && typeof reference.role === "string"
      && typeof reference.required === "boolean")
    && isRecord(value.output)
    && typeof value.output.relativePath === "string"
    && typeof value.output.width === "number"
    && typeof value.output.height === "number"
    && typeof value.output.format === "string"
    && typeof value.output.alpha === "string"
    && typeof value.output.writeMode === "string";
}

function normalizeAndAssertSafePath(value: string, field: string): string {
  const normalized = normalizeWorkspacePath(value);
  if (!isSafeWorkspaceRelativePath(normalized)) {
    throw new GenerationLineageError(
      `${field} must be a safe workspace-relative path.`,
    );
  }
  return normalized;
}

function normalizeTimestamp(value: string): string {
  const timestamp = value.trim();
  const parsed = Date.parse(timestamp);
  if (!timestamp || !Number.isFinite(parsed)) {
    throw new GenerationLineageError("createdAt must be a valid timestamp.");
  }
  return new Date(parsed).toISOString();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new GenerationLineageError(`${field} must be a string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
