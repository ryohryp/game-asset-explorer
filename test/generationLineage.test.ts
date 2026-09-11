import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationPackage } from "../src/core/generationPackage";
import {
  createApprovedGenerationLineageRecord,
  GenerationLineageError,
  parseGenerationLineage,
  serializeGenerationLineage,
} from "../src/core/generationLineage";
import type { GenerationInvocationReceipt } from "../src/core/imageGenerationProvider";

function createReceipt(): GenerationInvocationReceipt {
  return {
    generationPackage: createGenerationPackage({
      assetKind: "character",
      intent: "variant",
      userRequest: "Create a battle pose",
      references: [
        { relativePath: "assets/hero.png", role: "source", required: true },
        { relativePath: "assets/style.png", role: "style", required: true },
      ],
      output: {
        relativePath: "assets/hero_battle.png",
        width: 1024,
        height: 1024,
        format: "png",
        alpha: "preserve",
        writeMode: "create",
      },
    }),
    providerId: "image-provider",
    model: "image-model",
    candidates: [
      { id: "candidate-a", mediaType: "image/png", byteLength: 12 },
      { id: "candidate-b", mediaType: "image/png", byteLength: 15 },
    ],
  };
}

test("creates approved lineage from an existing generation receipt", () => {
  const record = createApprovedGenerationLineageRecord(
    createReceipt(),
    "candidate-b",
    "2026-09-11T03:00:00+09:00",
  );

  assert.equal(record.assetPath, "assets/hero_battle.png");
  assert.equal(record.relationship, "variant_of");
  assert.deepEqual(record.sourcePaths, ["assets/hero.png", "assets/style.png"]);
  assert.equal(record.providerId, "image-provider");
  assert.equal(record.model, "image-model");
  assert.equal(record.approvalStatus, "approved");
  assert.equal(record.createdAt, "2026-09-10T18:00:00.000Z");
});

test("rejects an unknown approved candidate", () => {
  assert.throws(
    () => createApprovedGenerationLineageRecord(
      createReceipt(),
      "missing",
      "2026-09-11T03:00:00Z",
    ),
    GenerationLineageError,
  );
});

test("rejects unsafe persisted output paths", () => {
  const receipt = createReceipt();
  receipt.generationPackage.output.relativePath = "../escape.png";

  assert.throws(
    () => createApprovedGenerationLineageRecord(
      receipt,
      "candidate-a",
      "2026-09-11T03:00:00Z",
    ),
    /safe workspace-relative path/,
  );
});

test("parses valid lineage and normalizes timestamps", () => {
  const record = createApprovedGenerationLineageRecord(
    createReceipt(),
    "candidate-a",
    "2026-09-11T03:00:00Z",
  );
  const parsed = parseGenerationLineage(
    JSON.stringify({ schemaVersion: 1, records: [record] }),
  );

  assert.equal(parsed.records[0]?.assetPath, "assets/hero_battle.png");
  assert.equal(parsed.records[0]?.createdAt, "2026-09-11T03:00:00.000Z");
});

test("rejects duplicate asset records and output mismatches", () => {
  const record = createApprovedGenerationLineageRecord(
    createReceipt(),
    "candidate-a",
    "2026-09-11T03:00:00Z",
  );

  assert.throws(
    () => parseGenerationLineage(
      JSON.stringify({ schemaVersion: 1, records: [record, record] }),
    ),
    /Duplicate lineage record/,
  );

  assert.throws(
    () => parseGenerationLineage(JSON.stringify({
      schemaVersion: 1,
      records: [{ ...record, assetPath: "assets/other.png" }],
    })),
    /must match/,
  );
});

test("serializes deterministically for Git review", () => {
  const first = createApprovedGenerationLineageRecord(
    createReceipt(),
    "candidate-a",
    "2026-09-11T03:00:00Z",
  );
  const secondReceipt = createReceipt();
  secondReceipt.generationPackage.output.relativePath = "assets/alpha.png";
  const second = createApprovedGenerationLineageRecord(
    secondReceipt,
    "candidate-b",
    "2026-09-11T04:00:00Z",
  );

  const text = serializeGenerationLineage({
    schemaVersion: 1,
    records: [first, second],
  });
  const parsed = JSON.parse(text) as {
    records: Array<{ assetPath: string }>;
  };

  assert.deepEqual(
    parsed.records.map((record) => record.assetPath),
    ["assets/alpha.png", "assets/hero_battle.png"],
  );
  assert.equal(text.endsWith("\n"), true);
});

test("manual assets need no lineage entry", () => {
  assert.deepEqual(
    parseGenerationLineage('{"schemaVersion":1,"records":[]}'),
    { schemaVersion: 1, records: [] },
  );
});
