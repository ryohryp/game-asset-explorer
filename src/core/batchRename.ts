export type BatchRenameCase = "none" | "lower" | "upper";

export interface BatchRenameOptions {
  prefix?: string;
  suffix?: string;
  replace?: { from: string; to: string };
  numbering?: { start?: number; pad?: number };
  case?: BatchRenameCase;
}

export interface BatchRenameInput { relativePath: string; fileName: string; }
export interface BatchRenamePlanItem { input: BatchRenameInput; targetFileName: string; targetRelativePath: string; }
export interface BatchRenamePlan { items: BatchRenamePlanItem[]; collisions: string[]; }

function splitName(fileName: string): { stem: string; extension: string } {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? { stem: fileName.slice(0, dot), extension: fileName.slice(dot) } : { stem: fileName, extension: "" };
}

export function planBatchRename(inputs: readonly BatchRenameInput[], options: BatchRenameOptions): BatchRenamePlan {
  const targets = new Map<string, number>();
  const items = inputs.map((input, index) => {
    const { stem: originalStem, extension } = splitName(input.fileName);
    let stem = originalStem;
    if (options.replace?.from) stem = stem.split(options.replace.from).join(options.replace.to);
    if (options.case === "lower") stem = stem.toLowerCase();
    if (options.case === "upper") stem = stem.toUpperCase();
    const number = options.numbering ? String((options.numbering.start ?? 1) + index).padStart(options.numbering.pad ?? 1, "0") : "";
    const targetFileName = `${options.prefix ?? ""}${stem}${number}${options.suffix ?? ""}${extension}`;
    const slash = input.relativePath.lastIndexOf("/");
    const parent = slash >= 0 ? input.relativePath.slice(0, slash + 1) : "";
    const targetRelativePath = `${parent}${targetFileName}`;
    targets.set(targetRelativePath.toLowerCase(), (targets.get(targetRelativePath.toLowerCase()) ?? 0) + 1);
    return { input, targetFileName, targetRelativePath };
  });
  const collisions = [...targets.entries()].filter(([, count]) => count > 1).map(([path]) => path);
  return { items, collisions };
}
