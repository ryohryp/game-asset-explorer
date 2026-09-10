import {
  type GenerationPackage,
  type GenerationValidationContext,
  normalizeWorkspacePath,
} from "./generationPackage";
import {
  invokeImageGeneration,
  type GeneratedImageCandidate,
  type GenerationInvocationReceipt,
  type ImageGenerationProvider,
} from "./imageGenerationProvider";

export interface VariantCandidateSummary {
  id: string;
  mediaType: string;
  byteLength: number;
  width?: number;
  height?: number;
}

export interface VariantCandidatePreview {
  id: string;
  mediaType: string;
  bytes: Uint8Array;
}

export interface VariantAssetWriter {
  write(relativePath: string, bytes: Uint8Array): Promise<void>;
}

export interface VariantApprovalContext {
  currentAssetPaths: readonly string[];
  writer: VariantAssetWriter;
}

export type VariantReviewStatus = "reviewing" | "approved" | "rejected";

export class VariantReviewSession {
  readonly generationPackage: GenerationPackage;
  readonly receipt: GenerationInvocationReceipt;
  readonly candidates: readonly VariantCandidateSummary[];
  private generatedCandidates: GeneratedImageCandidate[];
  private statusValue: VariantReviewStatus = "reviewing";

  constructor(
    generationPackage: GenerationPackage,
    receipt: GenerationInvocationReceipt,
    generatedCandidates: readonly GeneratedImageCandidate[],
  ) {
    this.generationPackage = generationPackage;
    this.receipt = receipt;
    this.generatedCandidates = [...generatedCandidates];
    this.candidates = generatedCandidates.map((candidate) => ({
      id: candidate.id,
      mediaType: candidate.mediaType,
      byteLength: candidate.bytes.byteLength,
      ...(candidate.width === undefined ? {} : { width: candidate.width }),
      ...(candidate.height === undefined ? {} : { height: candidate.height }),
    }));
  }

  get status(): VariantReviewStatus {
    return this.statusValue;
  }

  getCandidatePreview(candidateId: string): VariantCandidatePreview {
    this.assertReviewing();
    const candidate = this.generatedCandidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new Error(`Unknown generation candidate: ${candidateId}`);
    }

    return {
      id: candidate.id,
      mediaType: candidate.mediaType,
      bytes: candidate.bytes.slice(),
    };
  }

  reject(): void {
    this.assertReviewing();
    this.generatedCandidates = [];
    this.statusValue = "rejected";
  }

  async approve(candidateId: string, context: VariantApprovalContext): Promise<void> {
    this.assertReviewing();
    const candidate = this.generatedCandidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new Error(`Unknown generation candidate: ${candidateId}`);
    }

    const outputPath = normalizeWorkspacePath(this.generationPackage.output.relativePath);
    const currentPaths = new Set(context.currentAssetPaths.map(normalizeWorkspacePath));
    if (currentPaths.has(outputPath)) {
      throw new Error("Generation output now exists; refusing to overwrite it during variant approval.");
    }

    await context.writer.write(outputPath, candidate.bytes);
    this.generatedCandidates = [];
    this.statusValue = "approved";
  }

  private assertReviewing(): void {
    if (this.statusValue !== "reviewing") {
      throw new Error(`Variant review session is already ${this.statusValue}.`);
    }
  }
}

export async function startVariantReviewSession(
  provider: ImageGenerationProvider,
  generationPackage: GenerationPackage,
  validationContext: GenerationValidationContext,
): Promise<VariantReviewSession> {
  assertVariantReviewPackage(generationPackage);
  const invocation = await invokeImageGeneration(provider, generationPackage, validationContext);
  const candidates = invocation.providerResult.candidates;
  if (candidates.length < 2 || candidates.length > 4) {
    throw new Error("Generate Variant review requires between 2 and 4 candidates.");
  }

  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id.trim() || ids.has(candidate.id)) {
      throw new Error("Generate Variant candidates must have unique non-empty ids.");
    }
    ids.add(candidate.id);
  }

  return new VariantReviewSession(generationPackage, invocation.receipt, candidates);
}

function assertVariantReviewPackage(generationPackage: GenerationPackage): void {
  if (generationPackage.intent !== "variant") {
    throw new Error("Generate Variant review requires a variant Generation Package.");
  }
  if (generationPackage.output.writeMode !== "create") {
    throw new Error("Generate Variant review is create-only; replace mode is not supported.");
  }
  const approvedAnchor = generationPackage.references.find(
    (reference) => reference.role === "source" && reference.required,
  );
  if (!approvedAnchor) {
    throw new Error("Generate Variant review requires a required source reference as the Approved Anchor.");
  }
}
