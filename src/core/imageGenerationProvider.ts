import {
  assertValidGenerationPackage,
  type GenerationPackage,
  type GenerationValidationContext,
} from "./generationPackage";

export interface GeneratedImageCandidate {
  id: string;
  mediaType: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface ImageGenerationProviderResult {
  model?: string;
  candidates: GeneratedImageCandidate[];
}

export interface ImageGenerationProvider {
  readonly id: string;
  generate(generationPackage: GenerationPackage): Promise<ImageGenerationProviderResult>;
}

export interface GenerationCandidateReceipt {
  id: string;
  mediaType: string;
  byteLength: number;
  width?: number;
  height?: number;
}

export interface GenerationInvocationReceipt {
  generationPackage: GenerationPackage;
  providerId: string;
  model?: string;
  candidates: GenerationCandidateReceipt[];
}

export interface GenerationInvocationResult {
  providerResult: ImageGenerationProviderResult;
  receipt: GenerationInvocationReceipt;
}

export async function invokeImageGeneration(
  provider: ImageGenerationProvider,
  generationPackage: GenerationPackage,
  context: GenerationValidationContext,
): Promise<GenerationInvocationResult> {
  assertValidGenerationPackage(generationPackage, context);

  if (!provider.id.trim()) {
    throw new Error("Image generation provider must expose a non-empty id.");
  }

  const providerResult = await provider.generate(generationPackage);
  const receipt: GenerationInvocationReceipt = {
    generationPackage,
    providerId: provider.id,
    ...(providerResult.model?.trim() ? { model: providerResult.model.trim() } : {}),
    candidates: providerResult.candidates.map((candidate) => ({
      id: candidate.id,
      mediaType: candidate.mediaType,
      byteLength: candidate.bytes.byteLength,
      ...(candidate.width === undefined ? {} : { width: candidate.width }),
      ...(candidate.height === undefined ? {} : { height: candidate.height }),
    })),
  };

  return { providerResult, receipt };
}
