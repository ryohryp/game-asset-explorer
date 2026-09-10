import * as vscode from "vscode";
import {
  findVisualCanonEntriesForAsset,
  parseVisualCanon,
  resolveVisualCanonEntry,
  VISUAL_CANON_PATH,
  type ResolvedVisualCanonContext,
  type VisualCanonEntry,
  type VisualCanonFile,
} from "./core/visualCanon";
import { normalizeWorkspacePath } from "./core/generationPackage";
import { type WorkspaceAsset } from "./workspaceAsset";

export async function loadWorkspaceVisualCanon(workspaceAsset: WorkspaceAsset): Promise<VisualCanonFile | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(workspaceAsset.workspaceFolderUri));
  if (!folder) return undefined;

  const uri = vscode.Uri.joinPath(folder.uri, ...VISUAL_CANON_PATH.split("/"));
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return parseVisualCanon(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return undefined;
    }
    throw error;
  }
}

export async function getVisualCanonMembership(workspaceAsset: WorkspaceAsset): Promise<VisualCanonEntry[]> {
  const canon = await loadWorkspaceVisualCanon(workspaceAsset);
  return canon ? findVisualCanonEntriesForAsset(canon, workspaceAsset.asset.relativePath) : [];
}

export async function resolveVisualCanonForAsset(
  workspaceAsset: WorkspaceAsset,
  allAssets: readonly WorkspaceAsset[],
): Promise<ResolvedVisualCanonContext | undefined> {
  const canon = await loadWorkspaceVisualCanon(workspaceAsset);
  if (!canon) return undefined;

  const memberships = findVisualCanonEntriesForAsset(canon, workspaceAsset.asset.relativePath);
  if (memberships.length === 0) return undefined;
  if (memberships.length > 1) {
    throw new Error(`Selected asset belongs to multiple Visual Canon entries (${memberships.map((entry) => entry.id).join(", ")}). Resolve the ambiguity before generation.`);
  }

  const availablePaths = allAssets
    .filter((asset) => asset.workspaceFolderUri === workspaceAsset.workspaceFolderUri)
    .map((asset) => normalizeWorkspacePath(asset.asset.relativePath));
  return resolveVisualCanonEntry(canon, memberships[0].id, availablePaths);
}
