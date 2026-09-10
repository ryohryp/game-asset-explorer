import {
  findVisualCanonEntriesForAsset,
  parseVisualCanon,
  resolveVisualCanonEntry,
  VisualCanonError,
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
    throw new VisualCanonError(`Selected asset is not an anchor of Visual Canon entry '${entryId}'.`);
  }

  return resolveVisualCanonEntry(canon, entryId, sameWorkspacePaths);
}

export function resolveUnambiguousWorkspaceVisualCanon(
  selectedAsset: WorkspaceAsset,
  state: WorkspaceVisualCanonState,
  discoveredAssets: readonly WorkspaceAsset[],
): ResolvedVisualCanonContext | undefined {
  if (!state.canon || state.memberships.length === 0) {
    return undefined;
  }
  if (state.memberships.length > 1) {
    const ids = state.memberships.map((membership) => membership.id).join(", ");
    throw new VisualCanonError(
      `Selected asset belongs to multiple Visual Canon entries (${ids}). Choose a Canon entry before generation.`,
    );
  }
  return resolveWorkspaceVisualCanonMembership(
    selectedAsset,
    state.canon,
    state.memberships[0].id,
    discoveredAssets,
  );
}
