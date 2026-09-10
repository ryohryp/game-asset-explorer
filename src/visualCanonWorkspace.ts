import {
  findVisualCanonEntriesForAsset,
  parseVisualCanon,
  resolveVisualCanonEntry,
  type ResolvedVisualCanonContext,
  type VisualCanonEntry,
  type VisualCanonFile,
} from "./core/visualCanon";
import { type WorkspaceAsset } from "./workspaceAsset";

export interface VisualCanonMembership {
  id: string;
  kind: VisualCanonEntry["kind"];
  anchor: true;
}

export interface WorkspaceVisualCanonReader {
  read(workspaceFolderUri: string): Promise<string | undefined>;
}

export interface WorkspaceVisualCanonState {
  canon?: VisualCanonFile;
  memberships: VisualCanonMembership[];
}

export async function loadWorkspaceVisualCanonForAsset(
  selectedAsset: WorkspaceAsset,
  reader: WorkspaceVisualCanonReader,
): Promise<WorkspaceVisualCanonState> {
  const text = await reader.read(selectedAsset.workspaceFolderUri);
  if (text === undefined) {
    return { memberships: [] };
  }

  const canon = parseVisualCanon(text);
  const memberships = findVisualCanonEntriesForAsset(canon, selectedAsset.asset.relativePath).map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    anchor: true as const,
  }));
  return { canon, memberships };
}

export function resolveWorkspaceVisualCanonMembership(
  selectedAsset: WorkspaceAsset,
  canon: VisualCanonFile,
  entryId: string,
  discoveredAssets: readonly WorkspaceAsset[],
): ResolvedVisualCanonContext {
  const sameWorkspacePaths = discoveredAssets
    .filter((asset) => asset.workspaceFolderUri === selectedAsset.workspaceFolderUri)
    .map((asset) => asset.asset.relativePath);

  const memberships = findVisualCanonEntriesForAsset(canon, selectedAsset.asset.relativePath);
  if (!memberships.some((entry) => entry.id === entryId)) {
    throw new Error(`Selected asset is not an anchor of Visual Canon entry '${entryId}'.`);
  }

  return resolveVisualCanonEntry(canon, entryId, sameWorkspacePaths);
}
