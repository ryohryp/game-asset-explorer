import {
  GENERATION_LINEAGE_PATH,
  GenerationLineageError,
  buildGenerationLineageAssetView,
  createApprovedGenerationLineageRecord,
  parseGenerationLineage,
  serializeGenerationLineage,
  type GenerationLineageAssetView,
  type GenerationLineageDocument,
} from "./core/generationLineage";
import type { WorkspaceAsset } from "./workspaceAsset";
import type { GenerationInvocationReceipt } from "./core/imageGenerationProvider";

export interface GenerationLineageWorkspaceStore {
  read(relativePath: string): Promise<string | undefined>;
  write(relativePath: string, content: string): Promise<void>;
}

export interface WorkspaceGenerationLineageReader {
  read(workspaceFolderUri: string): Promise<string | undefined>;
}

export async function loadWorkspaceGenerationLineageForAsset(
  workspaceAsset: WorkspaceAsset,
  assets: readonly WorkspaceAsset[],
  reader: WorkspaceGenerationLineageReader,
): Promise<GenerationLineageAssetView> {
  const text = await reader.read(workspaceAsset.workspaceFolderUri);
  if (text === undefined) {
    return { sources: [], variants: [] };
  }

  const sameWorkspacePaths = assets
    .filter((asset) => asset.workspaceFolderUri === workspaceAsset.workspaceFolderUri)
    .map((asset) => asset.asset.relativePath);
  return buildGenerationLineageAssetView(
    parseGenerationLineage(text),
    workspaceAsset.asset.relativePath,
    sameWorkspacePaths,
  );
}

export async function persistApprovedGenerationLineage(
  store: GenerationLineageWorkspaceStore,
  receipt: GenerationInvocationReceipt,
  candidateId: string,
  createdAt: string,
): Promise<void> {
  const existingText = await store.read(GENERATION_LINEAGE_PATH);
  const document: GenerationLineageDocument = existingText === undefined
    ? { schemaVersion: 1, records: [] }
    : parseGenerationLineage(existingText);
  const record = createApprovedGenerationLineageRecord(receipt, candidateId, createdAt);

  if (document.records.some((item) => item.assetPath === record.assetPath)) {
    throw new GenerationLineageError(`Duplicate lineage record for asset: ${record.assetPath}`);
  }

  await store.write(
    GENERATION_LINEAGE_PATH,
    serializeGenerationLineage({
      schemaVersion: 1,
      records: [...document.records, record],
    }),
  );
}
