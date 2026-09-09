import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export type AssetFileType = "png" | "jpg" | "jpeg" | "webp" | "gif";

export interface AssetRecord {
  absolutePath: string;
  relativePath: string;
  fileType: AssetFileType;
}

export interface ScanAssetsOptions {
  workspaceRoot: string;
  assetDirectories: readonly string[];
}

export interface ScanAssetsResult {
  assets: AssetRecord[];
  warnings: string[];
}

export async function scanAssets(options: ScanAssetsOptions): Promise<ScanAssetsResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const assets: AssetRecord[] = [];
  const warnings: string[] = [];

  for (const configuredDirectory of options.assetDirectories) {
    const trimmedDirectory = configuredDirectory.trim();
    if (!trimmedDirectory) {
      continue;
    }

    const directoryPath = path.isAbsolute(trimmedDirectory)
      ? path.normalize(trimmedDirectory)
      : path.resolve(workspaceRoot, trimmedDirectory);

    try {
      const directoryStat = await stat(directoryPath);
      if (!directoryStat.isDirectory()) {
        warnings.push(`Configured asset path is not a directory: ${trimmedDirectory}`);
        continue;
      }
    } catch (error) {
      warnings.push(`Unable to scan asset directory ${trimmedDirectory}: ${formatError(error)}`);
      continue;
    }

    await collectAssets(directoryPath, workspaceRoot, assets, warnings);
  }

  assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { assets, warnings };
}

async function collectAssets(
  directoryPath: string,
  workspaceRoot: string,
  assets: AssetRecord[],
  warnings: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Unable to read ${normalizeDisplayPath(directoryPath, workspaceRoot)}: ${formatError(error)}`);
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await collectAssets(entryPath, workspaceRoot, assets, warnings);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue;
    }

    assets.push({
      absolutePath: entryPath,
      relativePath: normalizeDisplayPath(entryPath, workspaceRoot),
      fileType: extension.slice(1) as AssetFileType,
    });
  }
}

function normalizeDisplayPath(filePath: string, workspaceRoot: string): string {
  const relativePath = path.relative(workspaceRoot, filePath);
  const isInsideWorkspace = relativePath !== "" && !relativePath.startsWith(`..${path.sep}`) && relativePath !== "..";
  const displayPath = isInsideWorkspace ? relativePath : filePath;
  return displayPath.split(path.sep).join("/");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
