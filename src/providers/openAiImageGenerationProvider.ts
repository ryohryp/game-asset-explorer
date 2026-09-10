import { type GenerationPackage } from "../core/generationPackage";
import {
  type GeneratedImageCandidate,
  type ImageGenerationProvider,
  type ImageGenerationProviderResult,
} from "../core/imageGenerationProvider";

const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const ENDPOINT = "https://api.openai.com/v1/images/edits";

export interface ReferenceImageData {
  bytes: Uint8Array;
  mediaType: string;
  fileName: string;
}

export interface OpenAiImageEditRequest {
  model: string;
  prompt: string;
  size: string;
  outputFormat: "png" | "jpeg" | "webp";
  background: "auto" | "transparent";
  candidateCount: number;
  image: ReferenceImageData;
}

export interface OpenAiImageEditResponse {
  data: Array<{ b64_json?: string }>;
}

export interface OpenAiImageTransport {
  edit(request: OpenAiImageEditRequest, apiKey: string): Promise<OpenAiImageEditResponse>;
}

export interface OpenAiImageGenerationProviderOptions {
  apiKey: string;
  loadReference: (relativePath: string) => Promise<ReferenceImageData>;
  transport?: OpenAiImageTransport;
  model?: string;
  candidateCount?: number;
}

export class OpenAiImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "openai-images";
  private readonly apiKey: string;
  private readonly loadReference: OpenAiImageGenerationProviderOptions["loadReference"];
  private readonly transport: OpenAiImageTransport;
  private readonly model: string;
  private readonly candidateCount: number;

  constructor(options: OpenAiImageGenerationProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required for image generation.");
    }
    this.loadReference = options.loadReference;
    this.transport = options.transport ?? new FetchOpenAiImageTransport();
    this.model = options.model?.trim() || DEFAULT_MODEL;
    this.candidateCount = options.candidateCount ?? 3;
    if (!Number.isInteger(this.candidateCount) || this.candidateCount < 2 || this.candidateCount > 4) {
      throw new Error("OpenAI Generate Variant candidate count must be between 2 and 4.");
    }
  }

  async generate(generationPackage: GenerationPackage): Promise<ImageGenerationProviderResult> {
    const source = generationPackage.references.find(
      (reference) => reference.role === "source" && reference.required,
    );
    if (!source) {
      throw new Error("OpenAI Generate Variant requires a required source Approved Anchor.");
    }

    assertSupportedSize(generationPackage.output.width, generationPackage.output.height);
    const image = await this.loadReference(source.relativePath);
    if (image.bytes.byteLength === 0) {
      throw new Error("Approved Anchor image is empty and cannot be sent for generation.");
    }

    const outputFormat = generationPackage.output.format === "jpg"
      || generationPackage.output.format === "jpeg" ? "jpeg" : generationPackage.output.format;
    const response = await this.transport.edit({
      model: this.model,
      prompt: buildPrompt(generationPackage),
      size: `${generationPackage.output.width}x${generationPackage.output.height}`,
      outputFormat,
      background: generationPackage.output.alpha === "require" ? "transparent" : "auto",
      candidateCount: this.candidateCount,
      image,
    }, this.apiKey);

    if (!response || !Array.isArray(response.data) || response.data.length === 0) {
      throw new Error("OpenAI image generation returned no candidates.");
    }

    const mediaType = outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
    const candidates: GeneratedImageCandidate[] = response.data.map((item, index) => {
      if (!item || typeof item.b64_json !== "string" || !item.b64_json) {
        throw new Error("OpenAI image generation returned a malformed candidate.");
      }
      return {
        id: `openai-${index + 1}`,
        mediaType,
        bytes: Uint8Array.from(Buffer.from(item.b64_json, "base64")),
        width: generationPackage.output.width,
        height: generationPackage.output.height,
      };
    });

    return { model: this.model, candidates };
  }
}

export function buildPrompt(generationPackage: GenerationPackage): string {
  const parts = [
    `Create a ${generationPackage.assetKind} variant of the supplied Approved Anchor image.`,
    generationPackage.userRequest,
  ];
  if (generationPackage.context?.subjectId) parts.push(`Subject: ${generationPackage.context.subjectId}.`);
  if (generationPackage.context?.constraints?.length) {
    parts.push(`Preserve these constraints: ${generationPackage.context.constraints.join("; ")}.`);
  }
  if (generationPackage.context?.forbidden?.length) {
    parts.push(`Avoid: ${generationPackage.context.forbidden.join("; ")}.`);
  }
  if (generationPackage.output.alpha === "preserve") parts.push("Preserve the source image transparency behavior.");
  return parts.join(" ");
}

function assertSupportedSize(width: number, height: number): void {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const pixels = width * height;
  if (width % 16 !== 0 || height % 16 !== 0 || long > 3840 || long > short * 3 || pixels < 655360 || pixels > 8294400) {
    throw new Error("OpenAI GPT Image 2.5 output size is unsupported; use multiples of 16, aspect ratio up to 3:1, and 655,360–8,294,400 total pixels with edges no larger than 3840px.");
  }
}

class FetchOpenAiImageTransport implements OpenAiImageTransport {
  async edit(request: OpenAiImageEditRequest, apiKey: string): Promise<OpenAiImageEditResponse> {
    const form = new FormData();
    form.append("model", request.model);
    form.append("prompt", request.prompt);
    form.append("size", request.size);
    form.append("output_format", request.outputFormat);
    form.append("background", request.background);
    form.append("n", String(request.candidateCount));
    form.append("image[]", new Blob([request.image.bytes], { type: request.image.mediaType }), request.image.fileName);

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`OpenAI image generation failed with HTTP ${response.status}.`);
    }
    try {
      return await response.json() as OpenAiImageEditResponse;
    } catch {
      throw new Error("OpenAI image generation returned an invalid JSON response.");
    }
  }
}
