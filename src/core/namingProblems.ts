import type { WorkspaceAsset } from "../workspaceAsset";

export interface NamingProblem {
  asset: WorkspaceAsset;
  reasons: string[];
}

export function findNamingProblems(assets: readonly WorkspaceAsset[]): NamingProblem[] {
  const problems: NamingProblem[] = [];
  for (const asset of assets) {
    const fileName = asset.asset.fileName;
    const dot = fileName.lastIndexOf(".");
    const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
    const extension = dot >= 0 ? fileName.slice(dot + 1) : "";
    const reasons: string[] = [];
    if (/[A-Z]/.test(stem)) reasons.push("Filename contains uppercase letters");
    if (/[A-Z]/.test(extension)) reasons.push("Extension contains uppercase letters");
    if (/\s/.test(stem)) reasons.push("Filename contains whitespace");
    if (stem.includes("_") && stem.includes("-")) reasons.push("Filename mixes underscore and hyphen separators");
    if (reasons.length > 0) problems.push({ asset, reasons });
  }
  return problems.sort((a, b) => a.asset.asset.relativePath.localeCompare(b.asset.asset.relativePath));
}
