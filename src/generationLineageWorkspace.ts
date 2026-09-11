import {
  GENERATION_LINEAGE_PATH,
  GenerationLineageError,
  createApprovedGenerationLineageRecord,
  parseGenerationLineage,
  serializeGenerationLineage,
  type GenerationLineageDocument,
} from "./core/generationLineage";
import type { GenerationInvocationReceipt } from "./core/imageGenerationProvider";

export interface GenerationLineageWorkspaceStore {
  read(relativePath: string): Promise<string | undefined>;
  write(relativePath: string, content: string): Promise<void>;
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
