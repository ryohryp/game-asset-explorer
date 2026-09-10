import { getCharacterAssignment, type AssetTypeMetadataFile } from "./core/assetTypeMetadata";
import { type WorkspaceAsset } from "./workspaceAsset";

export const UNASSIGNED_CHARACTER_KEY = "__unassigned__";
export const UNASSIGNED_CHARACTER_LABEL = "Unassigned";

export interface CharacterAssetGroup {
  key: string;
  label: string;
  assets: WorkspaceAsset[];
}

/**
 * Groups the supplied assets without scanning or filtering them. Callers may pass
 * an already searched/faceted subset; grouping preserves that subset and order.
 */
export function groupWorkspaceAssetsByCharacter(
  assets: readonly WorkspaceAsset[],
  metadataByWorkspace: ReadonlyMap<string, AssetTypeMetadataFile>,
): CharacterAssetGroup[] {
  const groups = new Map<string, CharacterAssetGroup>();

  for (const asset of assets) {
    const metadata = metadataByWorkspace.get(asset.workspaceFolderUri);
    const character = metadata ? getCharacterAssignment(metadata, asset.asset.relativePath) : undefined;
    const key = character ?? UNASSIGNED_CHARACTER_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: character ?? UNASSIGNED_CHARACTER_LABEL,
        assets: [],
      };
      groups.set(key, group);
    }
    group.assets.push(asset);
  }

  const assigned = [...groups.values()]
    .filter((group) => group.key !== UNASSIGNED_CHARACTER_KEY)
    .sort((left, right) => left.label.localeCompare(right.label));
  const unassigned = groups.get(UNASSIGNED_CHARACTER_KEY);
  return unassigned ? [...assigned, unassigned] : assigned;
}
