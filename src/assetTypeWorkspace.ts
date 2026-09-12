import {
  createEmptyAssetTypeMetadata,
  getAssetCharacterAssignment,
  getAssetTypeAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
  setAssetCharacterAssignment,
  setAssetTypeAssignment,
} from "./core/assetTypeMetadata";
import { type AssetProfile } from "./core/assetProfiles";
import { type WorkspaceAsset } from "./workspaceAsset";

export interface WorkspaceAssetTypeStore {
  read(workspaceFolderUri: string): Promise<string | undefined>;
  write(workspaceFolderUri: string, text: string): Promise<void>;
}

export async function loadWorkspaceAssetTypes(
  assets: readonly WorkspaceAsset[],
  profile: AssetProfile,
  store: WorkspaceAssetTypeStore,
): Promise<WorkspaceAsset[]> {
  if (assets.length === 0) {
    return [];
  }

  const workspaceUris = [...new Set(assets.map((asset) => asset.workspaceFolderUri))];
  const metadataByWorkspace = new Map<string, ReturnType<typeof createEmptyAssetTypeMetadata> | undefined>();

  for (const workspaceFolderUri of workspaceUris) {
    const text = await store.read(workspaceFolderUri);
    metadataByWorkspace.set(
      workspaceFolderUri,
      text === undefined ? undefined : parseAssetTypeMetadata(text),
    );
  }

  return assets.map((workspaceAsset) => {
    const metadata = metadataByWorkspace.get(workspaceAsset.workspaceFolderUri);
    const assetType = metadata
      ? getAssetTypeAssignment(metadata, workspaceAsset.asset.relativePath, profile)
      : undefined;
    const character = metadata
      ? getAssetCharacterAssignment(metadata, workspaceAsset.asset.relativePath)
      : undefined;
    return {
      workspaceFolderUri: workspaceAsset.workspaceFolderUri,
      workspaceFolderName: workspaceAsset.workspaceFolderName,
      asset: workspaceAsset.asset,
      ...(assetType ? { assetType } : {}),
      ...(character ? { character } : {}),
    };
  });
}

export async function updateWorkspaceAssetType(
  selectedAsset: WorkspaceAsset,
  assetType: string | undefined,
  profile: AssetProfile,
  store: WorkspaceAssetTypeStore,
): Promise<void> {
  const existingText = await store.read(selectedAsset.workspaceFolderUri);
  const metadata = existingText === undefined
    ? createEmptyAssetTypeMetadata()
    : parseAssetTypeMetadata(existingText);
  const updated = setAssetTypeAssignment(metadata, selectedAsset.asset.relativePath, assetType, profile);
  await store.write(selectedAsset.workspaceFolderUri, serializeAssetTypeMetadata(updated));
}

export async function updateWorkspaceAssetTypes(
  selectedAssets: readonly WorkspaceAsset[],
  assetType: string,
  profile: AssetProfile,
  store: WorkspaceAssetTypeStore,
): Promise<number> {
  const targets = selectedAssets.filter((asset) => !asset.assetType);
  if (targets.length === 0) {
    return 0;
  }

  const workspaceUris = [...new Set(targets.map((asset) => asset.workspaceFolderUri))];
  if (workspaceUris.length !== 1) {
    throw new Error("Bulk Asset Type assignment must stay within one workspace.");
  }

  const workspaceFolderUri = workspaceUris[0];
  const existingText = await store.read(workspaceFolderUri);
  let metadata = existingText === undefined
    ? createEmptyAssetTypeMetadata()
    : parseAssetTypeMetadata(existingText);
  const uniquePaths = [...new Set(targets.map((asset) => asset.asset.relativePath))];
  for (const relativePath of uniquePaths) {
    metadata = setAssetTypeAssignment(metadata, relativePath, assetType, profile);
  }
  await store.write(workspaceFolderUri, serializeAssetTypeMetadata(metadata));
  return uniquePaths.length;
}

export async function updateWorkspaceAssetCharacter(
  selectedAsset: WorkspaceAsset,
  character: string | undefined,
  store: WorkspaceAssetTypeStore,
): Promise<void> {
  const existingText = await store.read(selectedAsset.workspaceFolderUri);
  const metadata = existingText === undefined
    ? createEmptyAssetTypeMetadata()
    : parseAssetTypeMetadata(existingText);
  const updated = setAssetCharacterAssignment(metadata, selectedAsset.asset.relativePath, character);
  await store.write(selectedAsset.workspaceFolderUri, serializeAssetTypeMetadata(updated));
}
