import { type GenerationValidationContext } from "./core/generationPackage";
import { type WorkspaceAsset } from "./workspaceAsset";

export function getGenerationValidationContext(
  selectedAsset: WorkspaceAsset,
  allAssets: readonly WorkspaceAsset[],
): GenerationValidationContext {
  return {
    availableAssetPaths: allAssets
      .filter((asset) => asset.workspaceFolderUri === selectedAsset.workspaceFolderUri)
      .map((asset) => asset.asset.relativePath),
  };
}
