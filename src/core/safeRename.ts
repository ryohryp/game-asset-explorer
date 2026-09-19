import * as path from "node:path";
import { findAssetUsageMatches, getAssetUsageCandidates } from "./assetUsages";
import { isSupportedAssetPath } from "./assetScanner";

export interface RenameReferenceEdit {
  startOffset: number;
  endOffset: number;
  before: string;
  after: string;
}

export const SAFE_RENAME_WARNING = "Only detected deterministic static references are updated. Dynamic, ambiguous, excluded, unreadable, or undetected references may remain. Search uses the Find Usages file types/exclusions and 5,000-file limit.";

export function planImageRename(source: string, newFileName: string): string {
  const segments = source.split("/");
  if (segments.some((part) => !part || part === "." || part === ".." || /[\\:\x00-\x1f]/.test(part))
    || !isSupportedAssetPath(source)) throw new Error("Source must be an image inside the workspace.");
  // Restrict replacement characters so literal escaping or URL encoding is never required.
  if (!/^[\p{L}\p{N}_-][\p{L}\p{N}_. -]*$/u.test(newFileName)
    || /[. ]$/.test(newFileName)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(newFileName)
    || path.posix.extname(newFileName) !== path.posix.extname(source)) {
    throw new Error("Enter a plain filename with the same image extension (letters, numbers, spaces, dots, _ and - only).");
  }
  const target = [...segments.slice(0, -1), newFileName].join("/");
  if (target.toLowerCase() === source.toLowerCase()) throw new Error("Choose a different name; case-only renames are not supported.");
  return target;
}

export function planReferenceEdits(text: string, source: string, target: string, sourcePath: string): {
  edits: RenameReferenceEdit[]; skippedMatches: number;
} {
  const matches = findAssetUsageMatches(text, getAssetUsageCandidates({ relativePath: source, fileName: path.posix.basename(source) }));
  const edits: RenameReferenceEdit[] = [];
  // Templates can contain nested expressions/quotes. Leave those files for manual review
  // instead of pretending this bounded text matcher is a language parser.
  if (text.includes("`")) return { edits, skippedMatches: matches.length };
  const literals = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|<!--[^]*?-->|"(?:\\[^]|[^"\\])*"|'(?:\\[^]|[^'\\])*'/g;
  for (const literal of text.matchAll(literals)) {
    const value = literal[0];
    if (value[0] !== '"' && value[0] !== "'") continue;
    const startOffset = literal.index! + 1;
    const before = value.slice(1, -1);
    if (/[\\\r\n]/.test(before) || before.includes("${")) continue;
    // Concatenated strings are dynamic, even when one fragment looks like a full path.
    const stripComments = (value: string): string => value.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, " ");
    const left = stripComments(text.slice(0, literal.index)).replace(/[\s(]+$/, "");
    const right = stripComments(text.slice(literal.index! + value.length)).replace(/^[\s)]+/, "");
    if (left.endsWith("+") || right.startsWith("+") || left.endsWith(".")) continue;
    const prefix = before.startsWith("./") ? "./" : before.startsWith("/") ? "/" : "";
    // Unrooted paths can be document-relative; only rewrite them in root files.
    if (prefix !== "/" && sourcePath.includes("/")) continue;
    if (!source.includes("/") || before !== prefix + source) continue;
    if (!matches.some((match) => match.startOffset === startOffset && match.endOffset === startOffset + before.length)) continue;
    edits.push({ startOffset, endOffset: startOffset + before.length, before, after: prefix + target });
  }
  return { edits, skippedMatches: matches.length - edits.length };
}
