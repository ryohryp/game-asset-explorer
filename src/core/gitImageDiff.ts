export type GitImageChangeKind = "added" | "modified" | "deleted";

export interface GitImageChange {
  relativePath: string;
  kind: GitImageChangeKind;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function parseGitImageStatus(output: string): GitImageChange[] {
  const changes: GitImageChange[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    if (rawLine.length < 4) continue;
    const status = rawLine.slice(0, 2);
    let relativePath = rawLine.slice(3).trim();
    if (relativePath.includes(" -> ")) relativePath = relativePath.split(" -> ").pop()!;
    relativePath = relativePath.replace(/^"|"$/g, "").replace(/\\/g, "/");
    const extension = relativePath.split(".").pop()?.toLowerCase();
    if (!extension || !IMAGE_EXTENSIONS.has(extension)) continue;
    const code = status.replace(/\s/g, "");
    const kind: GitImageChangeKind | undefined = code.includes("D")
      ? "deleted"
      : code.includes("A") || code === "??"
        ? "added"
        : code
          ? "modified"
          : undefined;
    if (kind) changes.push({ relativePath, kind });
  }
  return changes;
}
