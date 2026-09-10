import { type VariantReviewSession } from "./core/variantReviewSession";

export interface VariantCandidateView {
  id: string;
  mediaType: string;
  dataUri: string;
  byteLength: number;
  width?: number;
  height?: number;
}

export interface VariantReviewView {
  outputPath: string;
  candidates: readonly VariantCandidateView[];
}

export type VariantApprovalHandler = (
  session: VariantReviewSession,
  candidateId: string,
) => Promise<void>;

const SAFE_PREVIEW_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export class VariantReviewController {
  private session: VariantReviewSession | undefined;
  private readonly approveHandler: VariantApprovalHandler;

  constructor(approveHandler: VariantApprovalHandler) {
    this.approveHandler = approveHandler;
  }

  begin(session: VariantReviewSession): VariantReviewView {
    if (this.session) {
      throw new Error("A Generate Variant review is already active.");
    }
    if (session.status !== "reviewing") {
      throw new Error("Generate Variant review must start with an active review session.");
    }

    const candidates = session.candidates.map((candidate) => {
      const preview = session.getCandidatePreview(candidate.id);
      return {
        id: candidate.id,
        mediaType: candidate.mediaType,
        dataUri: toDataUri(preview.mediaType, preview.bytes),
        byteLength: candidate.byteLength,
        ...(candidate.width === undefined ? {} : { width: candidate.width }),
        ...(candidate.height === undefined ? {} : { height: candidate.height }),
      };
    });

    this.session = session;
    return {
      outputPath: session.generationPackage.output.relativePath,
      candidates,
    };
  }

  async approve(candidateId: string): Promise<void> {
    const session = this.requireActiveSession();
    const candidate = session.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new Error(`Unknown generation candidate: ${candidateId}`);
    }

    await this.approveHandler(session, candidateId);
    this.session = undefined;
  }

  reject(): void {
    const session = this.requireActiveSession();
    session.reject();
    this.session = undefined;
  }

  clearIfCompleted(): void {
    if (this.session && this.session.status !== "reviewing") {
      this.session = undefined;
    }
  }

  get hasActiveReview(): boolean {
    return this.session !== undefined && this.session.status === "reviewing";
  }

  private requireActiveSession(): VariantReviewSession {
    const session = this.session;
    if (!session || session.status !== "reviewing") {
      this.session = undefined;
      throw new Error("No active Generate Variant review is available.");
    }
    return session;
  }
}

function toDataUri(mediaType: string, bytes: Uint8Array): string {
  if (!SAFE_PREVIEW_MEDIA_TYPES.has(mediaType)) {
    throw new Error("Generate Variant preview uses an unsupported or unsafe image media type.");
  }
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
