import * as path from "node:path";

export type AssetFileOperation = "move" | "copy";

export interface AssetFileOperationPlan {
  operation: AssetFileOperation;
  sourceRelativePath: string;
  targetRelativePath: string;
}

export function planAssetFileOperation(
  operation: AssetFileOperation,
  sourceRelativePath: string,
  targetRelativePath: string,
): AssetFileOperationPlan {
  const source = normalizeRelativePath(sourceRelativePath);
  const target = normalizeRelativePath(targetRelativePath);
  if (!source || !target) throw new Error("Source and target paths are required.");
  if (source === target) throw new Error("Source and target paths must be different.");
  return { operation, sourceRelativePath: source, targetRelativePath: target };
}

export function normalizeRelativePath(value: string): string {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!trimmed || path.posix.isAbsolute(trimmed)) throw new Error("Path must be workspace-relative.");
  const normalized = path.posix.normalize(trimmed);
  if (normalized === ".." || normalized.startsWith("../")) throw new Error("Path must stay inside the workspace.");
  return normalized.replace(/^\.\//, "");
}
