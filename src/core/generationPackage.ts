import { isSupportedAssetPath } from "./assetScanner";

export type GenerationAssetKind = "character" | "environment" | "ui" | "item" | "effect" | "other";
export type GenerationIntent = "new-asset" | "variant" | "edit";
export type GenerationImageFormat = "png" | "jpg" | "jpeg" | "webp";
export type AlphaConstraint = "allow" | "require" | "forbid" | "preserve";
export type GenerationWriteMode = "create" | "replace";
export type GenerationReferenceRole = "source" | "subject" | "style";

export interface GenerationReference {
  relativePath: string;
  role: GenerationReferenceRole;
  required: boolean;
}

export interface GenerationOutputConstraints {
  relativePath: string;
  width: number;
  height: number;
  format: GenerationImageFormat;
  alpha: AlphaConstraint;
  writeMode: GenerationWriteMode;
}

export interface GenerationContext {
  subjectId?: string;
  constraints?: string[];
  forbidden?: string[];
}

export interface GenerationPackage {
  schemaVersion: 1;
  assetKind: GenerationAssetKind;
  intent: GenerationIntent;
  userRequest: string;
  references: GenerationReference[];
  output: GenerationOutputConstraints;
  context?: GenerationContext;
}

export interface GenerationPackageInput extends Omit<GenerationPackage, "schemaVersion" | "references" | "output" | "context"> {
  references?: readonly GenerationReference[];
  output: GenerationOutputConstraints;
  context?: GenerationContext;
}

export interface GenerationValidationContext {
  availableAssetPaths: readonly string[];
}

export interface GenerationValidationIssue {
  field: string;
  message: string;
}

export class GenerationPackageValidationError extends Error {
  readonly issues: readonly GenerationValidationIssue[];

  constructor(issues: readonly GenerationValidationIssue[]) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
    this.name = "GenerationPackageValidationError";
    this.issues = issues;
  }
}

export function createGenerationPackage(input: GenerationPackageInput): GenerationPackage {
  return {
    schemaVersion: 1,
    assetKind: input.assetKind,
    intent: input.intent,
    userRequest: input.userRequest.trim(),
    references: (input.references ?? []).map((reference) => ({
      relativePath: normalizeWorkspacePath(reference.relativePath),
      role: reference.role,
      required: reference.required,
    })),
    output: {
      ...input.output,
      relativePath: normalizeWorkspacePath(input.output.relativePath),
    },
    context: normalizeContext(input.context),
  };
}

export function validateGenerationPackage(
  generationPackage: GenerationPackage,
  context: GenerationValidationContext,
): GenerationValidationIssue[] {
  const issues: GenerationValidationIssue[] = [];
  const availablePaths = new Set(context.availableAssetPaths.map(normalizeWorkspacePath));

  if (generationPackage.schemaVersion !== 1) {
    issues.push({ field: "schemaVersion", message: "Unsupported Generation Package schema version." });
  }

  if (!generationPackage.userRequest.trim()) {
    issues.push({ field: "userRequest", message: "A user request is required." });
  }

  const outputPath = generationPackage.output.relativePath;
  if (!isSafeWorkspaceRelativePath(outputPath)) {
    issues.push({ field: "output.relativePath", message: "Output must stay inside the workspace and use a relative path." });
  } else if (!isSupportedAssetPath(outputPath)) {
    issues.push({ field: "output.relativePath", message: "Output must use a supported image extension." });
  } else if (!outputExtensionMatchesFormat(outputPath, generationPackage.output.format)) {
    issues.push({ field: "output.format", message: "Output format must match the output filename extension." });
  }

  if (!Number.isInteger(generationPackage.output.width) || generationPackage.output.width <= 0) {
    issues.push({ field: "output.width", message: "Width must be a positive integer." });
  }
  if (!Number.isInteger(generationPackage.output.height) || generationPackage.output.height <= 0) {
    issues.push({ field: "output.height", message: "Height must be a positive integer." });
  }
  if (
    generationPackage.output.alpha === "require"
    && (generationPackage.output.format === "jpg" || generationPackage.output.format === "jpeg")
  ) {
    issues.push({ field: "output.alpha", message: "JPEG output cannot require an alpha channel." });
  }

  const outputExists = availablePaths.has(outputPath);
  if (generationPackage.output.writeMode === "create" && outputExists) {
    issues.push({ field: "output.writeMode", message: "Create mode cannot overwrite an existing asset." });
  }
  if (generationPackage.output.writeMode === "replace") {
    if (generationPackage.intent !== "edit") {
      issues.push({ field: "intent", message: "Replace mode requires an explicit edit intent." });
    }
    if (!outputExists) {
      issues.push({ field: "output.writeMode", message: "Replace mode requires an existing target asset." });
    }
  }

  generationPackage.references.forEach((reference, index) => {
    const field = `references[${index}].relativePath`;
    if (!isSafeWorkspaceRelativePath(reference.relativePath)) {
      issues.push({ field, message: "Reference must stay inside the workspace and use a relative path." });
      return;
    }
    if (!isSupportedAssetPath(reference.relativePath)) {
      issues.push({ field, message: "Reference must point to a supported image asset." });
      return;
    }
    if (reference.required && !availablePaths.has(reference.relativePath)) {
      issues.push({ field, message: "Required reference asset does not exist in the current asset set." });
    }
  });

  return issues;
}

export function assertValidGenerationPackage(
  generationPackage: GenerationPackage,
  context: GenerationValidationContext,
): void {
  const issues = validateGenerationPackage(generationPackage, context);
  if (issues.length > 0) {
    throw new GenerationPackageValidationError(issues);
  }
}

export function isSafeWorkspaceRelativePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return false;
  }

  const normalized = normalizeWorkspacePath(value);
  if (!normalized || normalized === "." || normalized === "..") {
    return false;
  }

  return !normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

export function normalizeWorkspacePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function outputExtensionMatchesFormat(relativePath: string, format: GenerationImageFormat): boolean {
  const extension = relativePath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) {
    return false;
  }
  if (format === "jpg" || format === "jpeg") {
    return extension === "jpg" || extension === "jpeg";
  }
  return extension === format;
}

function normalizeContext(context: GenerationContext | undefined): GenerationContext | undefined {
  if (!context) {
    return undefined;
  }

  const subjectId = context.subjectId?.trim();
  const constraints = normalizeTextList(context.constraints);
  const forbidden = normalizeTextList(context.forbidden);
  if (!subjectId && constraints.length === 0 && forbidden.length === 0) {
    return undefined;
  }

  return {
    ...(subjectId ? { subjectId } : {}),
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(forbidden.length > 0 ? { forbidden } : {}),
  };
}

function normalizeTextList(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}
