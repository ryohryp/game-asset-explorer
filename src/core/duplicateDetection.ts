import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { WorkspaceAsset } from "../workspaceAsset";

export interface DuplicateAsset {
  asset: WorkspaceAsset;
  sizeBytes: number;
}

export interface DuplicateAssetGroup {
  digest: string;
  assets: DuplicateAsset[];
}

export async function findExactDuplicateAssets(
  assets: readonly WorkspaceAsset[],
): Promise<DuplicateAssetGroup[]> {
  const byDigest = new Map<string, DuplicateAsset[]>();

  for (const asset of assets) {
    const bytes = await readFile(asset.asset.absolutePath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const group = byDigest.get(digest) ?? [];
    group.push({ asset, sizeBytes: bytes.byteLength });
    byDigest.set(digest, group);
  }

  return [...byDigest.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([digest, group]) => ({ digest, assets: group }))
    .sort((a, b) => a.assets[0].asset.asset.relativePath.localeCompare(b.assets[0].asset.asset.relativePath));
}
