import { type WorkspaceAsset } from "../workspaceAsset";

export const UNASSIGNED_CHARACTER_LABEL = "Unassigned";

export interface CharacterAssetGroup {
  character?: string;
  label: string;
  assets: WorkspaceAsset[];
}

export function groupWorkspaceAssetsByCharacter(
  assets: readonly WorkspaceAsset[],
): CharacterAssetGroup[] {
  const assigned = new Map<string, WorkspaceAsset[]>();
  const unassigned: WorkspaceAsset[] = [];

  for (const asset of assets) {
    if (!asset.character) {
      unassigned.push(asset);
      continue;
    }
    const group = assigned.get(asset.character) ?? [];
    group.push(asset);
    assigned.set(asset.character, group);
  }

  const groups: CharacterAssetGroup[] = [...assigned.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([character, groupedAssets]) => ({
      character,
      label: character,
      assets: groupedAssets,
    }));

  if (unassigned.length > 0) {
    groups.push({ label: UNASSIGNED_CHARACTER_LABEL, assets: unassigned });
  }
  return groups;
}

export function listCharacterNames(assets: readonly WorkspaceAsset[]): string[] {
  return [...new Set(assets.flatMap((asset) => asset.character ? [asset.character] : []))]
    .sort((left, right) => left.localeCompare(right));
}
