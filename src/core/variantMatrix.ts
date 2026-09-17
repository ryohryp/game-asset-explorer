import type { WorkspaceAsset } from "../workspaceAsset";

export interface VariantMatrixRow {
  workspaceFolderUri: string;
  baseName: string;
  variants: Readonly<Record<string, WorkspaceAsset>>;
}

export interface VariantMatrix {
  variants: string[];
  rows: VariantMatrixRow[];
}

export function buildVariantMatrix(assets: readonly WorkspaceAsset[]): VariantMatrix {
  const rows = new Map<string, { workspaceFolderUri: string; baseName: string; variants: Record<string, WorkspaceAsset> }>();
  const variants = new Set<string>();

  for (const asset of assets) {
    const parsed = parseVariantFileName(asset.asset.fileName);
    if (!parsed) continue;
    variants.add(parsed.variant);
    const key = `${asset.workspaceFolderUri}\0${parsed.baseName}`;
    const row = rows.get(key) ?? { workspaceFolderUri: asset.workspaceFolderUri, baseName: parsed.baseName, variants: {} };
    row.variants[parsed.variant] ??= asset;
    rows.set(key, row);
  }

  return {
    variants: [...variants].sort(),
    rows: [...rows.values()].filter((row) => Object.keys(row.variants).length >= 2).sort((a, b) => a.baseName.localeCompare(b.baseName)),
  };
}

export function parseVariantFileName(fileName: string): { baseName: string; variant: string } | undefined {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const match = /^(.+?)[_-]([a-z][a-z0-9-]*)$/i.exec(stem);
  if (!match) return undefined;
  const baseName = match[1].trim();
  const variant = match[2].toLowerCase();
  return baseName && variant ? { baseName, variant } : undefined;
}
