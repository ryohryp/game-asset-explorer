import {
  createEmptyAssetTypeMetadata,
  getAssetTypeAssignment,
  parseAssetTypeMetadata,
  serializeAssetTypeMetadata,
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
    return {
      workspaceFolderUri: workspaceAsset.workspaceFolderUri,
      workspaceFolderName: workspaceAsset.workspaceFolderName,
      asset: workspaceAsset.asset,
      ...(assetType ? { assetType } : {}),
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
