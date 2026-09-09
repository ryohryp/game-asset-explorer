import { stat } from "node:fs/promises";
import { AssetRecord } from "./assetScanner";

export interface AssetDetails {
  sizeBytes: number;
  modifiedAt: number;
}

export type AssetDetailsResult =
  | { status: "available"; details: AssetDetails }
  | { status: "missing" };

export async function loadAssetDetails(asset: AssetRecord): Promise<AssetDetailsResult> {
  try {
    const fileStat = await stat(asset.absolutePath);
    if (!fileStat.isFile()) {
      return { status: "missing" };
    }

    return {
      status: "available",
      details: {
        sizeBytes: fileStat.size,
        modifiedAt: fileStat.mtimeMs,
      },
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { status: "missing" };
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}
