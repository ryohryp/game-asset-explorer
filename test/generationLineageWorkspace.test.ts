import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationInvocationReceipt } from "../src/core/imageGenerationProvider";
import { GenerationLineageError, parseGenerationLineage } from "../src/core/generationLineage";
import {
  persistApprovedGenerationLineage,
  type GenerationLineageWorkspaceStore,
} from "../src/generationLineageWorkspace";

function receipt(output = "assets/hero-run.png"): GenerationInvocationReceipt {
  return {
    providerId: "fake-provider",
    model: "fake-model",
    generationPackage: {
      schemaVersion: 1,
      assetKind: "character",
      intent: "variant",
      userRequest: "running pose",
      references: [{ relativePath: "assets/hero.png", role: "source", required: true }],
      output: {
        relativePath: output,
        width: 1024,
        height: 1024,
        format: "png",
        alpha: "require",
        writeMode: "create",
      },
    },
    candidates: [{ id: "candidate-1", mediaType: "image/png", byteLength: 3 }],
  };
}

function memoryStore(initial?: string): GenerationLineageWorkspaceStore & { value?: string } {
  return {
    value: initial,
    async read() { return this.value; },
    async write(_path, content) { this.value = content; },
  };
}

test("persists the first approved lineage record", async () => {
  const store = memoryStore();
  await persistApprovedGenerationLineage(store, receipt(), "candidate-1", "2026-09-11T00:00:00Z");
  const parsed = parseGenerationLineage(store.value!);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].assetPath, "assets/hero-run.png");
  assert.deepEqual(parsed.records[0].sourcePaths, ["assets/hero.png"]);
});

test("preserves existing records when appending", async () => {
  const store = memoryStore();
  await persistApprovedGenerationLineage(store, receipt("assets/hero-run.png"), "candidate-1", "2026-09-11T00:00:00Z");
  await persistApprovedGenerationLineage(store, receipt("assets/hero-jump.png"), "candidate-1", "2026-09-11T00:01:00Z");
  const parsed = parseGenerationLineage(store.value!);
  assert.deepEqual(parsed.records.map((record) => record.assetPath), [
    "assets/hero-jump.png",
    "assets/hero-run.png",
  ]);
});

test("fails closed for a duplicate output record", async () => {
  const store = memoryStore();
  await persistApprovedGenerationLineage(store, receipt(), "candidate-1", "2026-09-11T00:00:00Z");
  await assert.rejects(
    persistApprovedGenerationLineage(store, receipt(), "candidate-1", "2026-09-11T00:01:00Z"),
    GenerationLineageError,
  );
});

test("does not replace existing metadata when persistence fails", async () => {
  const store: GenerationLineageWorkspaceStore & { writes: number } = {
    writes: 0,
    async read() { return undefined; },
    async write() { this.writes += 1; throw new Error("disk full"); },
  };
  await assert.rejects(
    persistApprovedGenerationLineage(store, receipt(), "candidate-1", "2026-09-11T00:00:00Z"),
    /disk full/,
  );
  assert.equal(store.writes, 1);
});
