import {
  assertValidGenerationPackage,
  createGenerationPackage,
  type AlphaConstraint,
  type GenerationAssetKind,
  type GenerationContext,
  type GenerationImageFormat,
  type GenerationPackage,
  type GenerationValidationContext,
} from "./generationPackage";

export interface NewAssetPromptInput {
  assetKind: GenerationAssetKind;
  userRequest: string;
  output: {
    relativePath: string;
    width: number;
    height: number;
    format: GenerationImageFormat;
    alpha: Exclude<AlphaConstraint, "preserve">;
  };
  context?: GenerationContext;
}

export interface NewAssetPromptResult {
  generationPackage: GenerationPackage;
  prompt: string;
}

export function createNewAssetPrompt(
  input: NewAssetPromptInput,
  validationContext: GenerationValidationContext,
): NewAssetPromptResult {
  const generationPackage = createGenerationPackage({
    assetKind: input.assetKind,
    intent: "new-asset",
    userRequest: input.userRequest,
    references: [],
    output: {
      ...input.output,
      writeMode: "create",
    },
    context: input.context,
  });

  assertValidGenerationPackage(generationPackage, validationContext);

  return {
    generationPackage,
    prompt: buildNewAssetPrompt(generationPackage),
  };
}

export function buildNewAssetPrompt(generationPackage: GenerationPackage): string {
  if (generationPackage.intent !== "new-asset") {
    throw new Error("Generate New Asset prompt requires a new-asset Generation Package.");
  }
  if (generationPackage.output.writeMode !== "create") {
    throw new Error("Generate New Asset prompt is create-only.");
  }

  const { output } = generationPackage;
  const format = output.format === "jpg" ? "JPEG" : output.format.toUpperCase();
  const lines = [
    `Create a game-ready ${generationPackage.assetKind} image asset.`,
    `Request: ${generationPackage.userRequest}`,
    `Output requirements: ${output.width}x${output.height} ${format}. ${alphaInstruction(output.alpha)}`,
  ];

  if (generationPackage.context?.subjectId) {
    lines.push(`Project visual canon: ${generationPackage.context.subjectId}.`);
  }
  if (generationPackage.context?.constraints?.length) {
    lines.push(`Follow these project constraints: ${generationPackage.context.constraints.join("; ")}.`);
  }
  if (generationPackage.context?.forbidden?.length) {
    lines.push(`Avoid: ${generationPackage.context.forbidden.join("; ")}.`);
  }

  lines.push("Return only the requested image asset without explanatory text or watermarks.");
  return lines.join("\n");
}

function alphaInstruction(alpha: AlphaConstraint): string {
  switch (alpha) {
    case "require":
      return "Use a transparent background and preserve useful transparency around the asset.";
    case "forbid":
      return "Do not use transparency; fill the full canvas.";
    case "allow":
      return "Transparency is allowed when appropriate for the asset.";
    case "preserve":
      return "Preserve the source transparency behavior.";
  }
}
