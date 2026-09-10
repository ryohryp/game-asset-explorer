import {
  type VariantIntentPreset,
  type VariantOutputSize,
  type VariantRequestInput,
} from "./variantRequest";
import { type GenerationImageFormat } from "./core/generationPackage";

export interface StartVariantMessage {
  type: "startVariant";
  identity: string;
  input: VariantRequestInput;
}

export interface ApproveVariantMessage {
  type: "approveVariant";
  candidateId: string;
}

export interface RejectVariantMessage {
  type: "rejectVariant";
}

const PRESETS = new Set<VariantIntentPreset>(["pose-action", "damage-state", "environment", "custom"]);
const OUTPUT_SIZES = new Set<VariantOutputSize>(["1024x1024", "1536x1024", "1024x1536"]);
const OUTPUT_FORMATS = new Set<GenerationImageFormat>(["png", "jpg", "jpeg", "webp"]);

export function parseStartVariantMessage(message: unknown): StartVariantMessage | undefined {
  if (!isRecord(message) || message.type !== "startVariant" || typeof message.identity !== "string" || !isRecord(message.input)) {
    return undefined;
  }

  const input = message.input;
  if (typeof input.preset !== "string" || !PRESETS.has(input.preset as VariantIntentPreset)) {
    return undefined;
  }
  if (!isOptionalString(input.customRequest) || !isOptionalString(input.outputPath)) {
    return undefined;
  }
  if (input.outputSize !== undefined && (typeof input.outputSize !== "string" || !OUTPUT_SIZES.has(input.outputSize as VariantOutputSize))) {
    return undefined;
  }
  if (input.outputFormat !== undefined && (typeof input.outputFormat !== "string" || !OUTPUT_FORMATS.has(input.outputFormat as GenerationImageFormat))) {
    return undefined;
  }

  return {
    type: "startVariant",
    identity: message.identity,
    input: {
      preset: input.preset as VariantIntentPreset,
      ...(input.customRequest === undefined ? {} : { customRequest: input.customRequest }),
      ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
      ...(input.outputSize === undefined ? {} : { outputSize: input.outputSize as VariantOutputSize }),
      ...(input.outputFormat === undefined ? {} : { outputFormat: input.outputFormat as GenerationImageFormat }),
    },
  };
}

export function parseApproveVariantMessage(message: unknown): ApproveVariantMessage | undefined {
  if (!isRecord(message) || message.type !== "approveVariant" || typeof message.candidateId !== "string" || !message.candidateId) {
    return undefined;
  }
  return { type: "approveVariant", candidateId: message.candidateId };
}

export function isRejectVariantMessage(message: unknown): message is RejectVariantMessage {
  return isRecord(message) && message.type === "rejectVariant";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}
