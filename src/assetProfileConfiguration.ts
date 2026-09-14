import * as vscode from "vscode";
import { isAssetProfileId, type AssetProfileId } from "./core/assetProfiles";

export async function updateConfiguredAssetProfile(profileId: AssetProfileId): Promise<void> {
  if (!isAssetProfileId(profileId)) {
    throw new Error(`Unknown Asset Profile '${profileId}'.`);
  }

  const configuration = vscode.workspace.getConfiguration("gameAssetExplorer");
  await configuration.update("assetProfile", profileId, vscode.ConfigurationTarget.Workspace);
}
