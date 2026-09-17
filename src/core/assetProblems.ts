import { readFile, stat } from "node:fs/promises";
import type { WorkspaceAsset } from "../workspaceAsset";

export interface AssetProblemLimits {
  maxWidth: number;
  maxHeight: number;
  maxSizeBytes: number;
}

export const DEFAULT_ASSET_PROBLEM_LIMITS: AssetProblemLimits = {
  maxWidth: 4096,
  maxHeight: 4096,
  maxSizeBytes: 5 * 1024 * 1024,
};

export interface AssetProblem {
  asset: WorkspaceAsset;
  sizeBytes: number;
  width?: number;
  height?: number;
  reasons: string[];
}

export async function findAssetProblems(
  assets: readonly WorkspaceAsset[],
  limits: AssetProblemLimits | ((asset: WorkspaceAsset) => AssetProblemLimits) = DEFAULT_ASSET_PROBLEM_LIMITS,
): Promise<AssetProblem[]> {
  const problems: AssetProblem[] = [];
  for (const asset of assets) {
    const assetLimits = typeof limits === "function" ? limits(asset) : limits;
    const fileStat = await stat(asset.asset.absolutePath);
    const bytes = await readFile(asset.asset.absolutePath);
    const dimensions = readImageDimensions(bytes);
    const reasons: string[] = [];
    if (fileStat.size > assetLimits.maxSizeBytes) reasons.push(`File size ${fileStat.size} bytes exceeds ${assetLimits.maxSizeBytes}`);
    if (dimensions && (dimensions.width > assetLimits.maxWidth || dimensions.height > assetLimits.maxHeight)) {
      reasons.push(`Dimensions ${dimensions.width}×${dimensions.height} exceed ${assetLimits.maxWidth}×${assetLimits.maxHeight}`);
    }
    if (reasons.length > 0) problems.push({ asset, sizeBytes: fileStat.size, ...dimensions, reasons });
  }
  return problems;
}

export function readImageDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer.subarray(0, 6).toString("ascii").startsWith("GIF8")) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && offset + 8 < buffer.length) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    const kind = buffer.subarray(12, 16).toString("ascii");
    if (kind === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer[24] + (buffer[25] << 8) + ((buffer[26] & 0x0f) << 16);
      const height = 1 + buffer[27] + (buffer[28] << 8) + ((buffer[29] & 0x0f) << 16);
      return { width, height };
    }
  }
  return undefined;
}
