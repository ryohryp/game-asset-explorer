import * as path from "node:path";
import {
  createGenerationPackage,
  isSafeWorkspaceRelativePath,
  normalizeWorkspacePath,
  type GenerationAssetKind,
  type GenerationImageFormat,
  type GenerationPackage,
} from "./core/generationPackage";
import { type ResolvedVisualCanonContext } from "./core/visualCanon";
import { type WorkspaceAsset } from "./workspaceAsset";

export type VariantIntentPreset = "pose-action" | "damage-state" | "environment" | "custom";
export type VariantOutputSize = "1024x1024" | "1536x1024" | "1024x1536";

export interface VariantRequestInput {
  preset: VariantIntentPreset;
  customRequest?: string;
  outputPath?: string;
  outputSize?: VariantOutputSize;
  outputFormat?: GenerationImageFormat;
  assetKind?: GenerationAssetKind;
  visualCanon?: ResolvedVisualCanonContext;
}

const PRESET_REQUESTS: Record<Exclude<VariantIntentPreset, "custom">, string> = {
  "pose-action": "Create a distinct pose or action while preserving the Approved Anchor's identity, silhouette, and visual style.",
  "damage-state": "Create a damaged or worn state while preserving the Approved Anchor's identity, silhouette, and visual style.",
  environment: "Create an environment, time-of-day, or weather variant while preserving the Approved Anchor's subject identity and visual style.",
};

const OUTPUT_SIZES: Record<VariantOutputSize, { width: number; height: number }> = {
  "1024x1024": { width: 1024, height: 1024 },
  "1536x1024": { width: 1536, height: 1024 },
  "1024x1536": { width: 1024, height: 1536 },
};

export function getVariantPresetRequest(preset: VariantIntentPreset, customRequest?: string): string {
  if (preset === "custom") {
    const request = customRequest?.trim() ?? "";
    if (!request) throw new Error("A custom variant request is required for custom intent.");
    return request;
  }
  return PRESET_REQUESTS[preset];
}

export function getDefaultVariantOutputPath(
  asset: WorkspaceAsset,
  format: GenerationImageFormat = defaultFormatForAsset(asset),
): string {
  const relativePath = normalizeWorkspacePath(asset.asset.relativePath);
  if (!isSafeWorkspaceRelativePath(relativePath)) {
    throw new Error("Generate Variant requires an Approved Anchor inside the selected workspace.");
  }
  const directory = path.posix.dirname(relativePath);
  const extension = format === "jpeg" ? "jpg" : format;
  const baseName = path.posix.basename(relativePath, path.posix.extname(relativePath));
  const fileName = `${baseName}_variant.${extension}`;
  return directory === "." ? fileName : `${directory}/${fileName}`;
}

export function buildVariantGenerationPackage(
  selectedAsset: WorkspaceAsset,
  input: VariantRequestInput,
): GenerationPackage {
  const sourcePath = normalizeWorkspacePath(selectedAsset.asset.relativePath);
  if (!isSafeWorkspaceRelativePath(sourcePath)) {
    throw new Error("Generate Variant requires an Approved Anchor inside the selected workspace.");
  }

  const format = input.outputFormat ?? defaultFormatForAsset(selectedAsset);
  const outputPath = normalizeWorkspacePath(input.outputPath?.trim() || getDefaultVariantOutputPath(selectedAsset, format));
  if (!isSafeWorkspaceRelativePath(outputPath)) {
    throw new Error("Variant output path must stay inside the selected workspace.");
  }
  if (!outputExtensionMatchesFormat(outputPath, format)) {
    throw new Error("Variant output filename extension must match the selected output format.");
  }

  const size = OUTPUT_SIZES[input.outputSize ?? "1024x1024"];
  const canonReferences = input.visualCanon?.references.filter((reference) => reference.relativePath !== sourcePath) ?? [];
  return createGenerationPackage({
    assetKind: input.visualCanon?.entry.kind ?? input.assetKind ?? "other",
    intent: "variant",
    userRequest: getVariantPresetRequest(input.preset, input.customRequest),
    references: [{ relativePath: sourcePath, role: "source", required: true }, ...canonReferences],
    output: {
      relativePath: outputPath,
      width: size.width,
      height: size.height,
      format,
      alpha: "preserve",
      writeMode: "create",
    },
    ...(input.visualCanon ? { context: input.visualCanon.context } : {}),
  });
}

export function getVariantOutputSizes(): readonly VariantOutputSize[] {
  return ["1024x1024", "1536x1024", "1024x1536"];
}

function defaultFormatForAsset(asset: WorkspaceAsset): GenerationImageFormat {
  switch (asset.asset.fileType) {
    case "jpg":
    case "jpeg":
    case "webp":
    case "png":
      return asset.asset.fileType;
    case "gif":
      return "png";
  }
}

function outputExtensionMatchesFormat(relativePath: string, format: GenerationImageFormat): boolean {
  const extension = path.posix.extname(relativePath).toLowerCase().slice(1);
  if (format === "jpg" || format === "jpeg") return extension === "jpg" || extension === "jpeg";
  return extension === format;
}
