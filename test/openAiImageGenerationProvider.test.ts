import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationPackage, type GenerationPackage } from "../src/core/generationPackage";
import {
  FetchOpenAiImageTransport,
  OpenAiImageGenerationProvider,
  type OpenAiImageEditRequest,
  type OpenAiImageTransport,
} from "../src/providers/openAiImageGenerationProvider";

const SECRET = "sk-test-secret-value";

function variantPackage(overrides: Partial<GenerationPackage> = {}): GenerationPackage {
  const base = createGenerationPackage({
    assetKind: "character",
    intent: "variant",
    userRequest: "Make a damaged battle variant.",
    references: [{ relativePath: "assets/hero.png", role: "source", required: true }],
    output: {
      relativePath: "assets/hero_damaged.png",
      width: 1024,
      height: 1024,
      format: "png",
      alpha: "require",
      writeMode: "create",
    },
    context: {
      subjectId: "hero",
      constraints: ["keep silhouette", "same costume"],
      forbidden: ["photorealism"],
    },
  });
  return { ...base, ...overrides };
}

class CapturingTransport implements OpenAiImageTransport {
  request?: OpenAiImageEditRequest;
  key?: string;
  constructor(private readonly response = {
    data: [
      { b64_json: Buffer.from("candidate-a").toString("base64") },
      { b64_json: Buffer.from("candidate-b").toString("base64") },
      { b64_json: Buffer.from("candidate-c").toString("base64") },
    ],
  }) {}

  async edit(request: OpenAiImageEditRequest, apiKey: string) {
    this.request = request;
    this.key = apiKey;
    return this.response;
  }
}

test("builds an Approved Anchor edit request and returns multiple transient candidates", async () => {
  const transport = new CapturingTransport();
  const provider = new OpenAiImageGenerationProvider({
    apiKey: SECRET,
    transport,
    loadReference: async (relativePath) => {
      assert.equal(relativePath, "assets/hero.png");
      return { bytes: Uint8Array.from([1, 2, 3]), mediaType: "image/png", fileName: "hero.png" };
    },
  });

  const result = await provider.generate(variantPackage());

  assert.equal(transport.key, SECRET);
  assert.equal(transport.request?.model, "gpt-image-2.5-sunburst");
  assert.equal(transport.request?.size, "1024x1024");
  assert.equal(transport.request?.outputFormat, "png");
  assert.equal(transport.request?.background, "transparent");
  assert.equal(transport.request?.candidateCount, 3);
  assert.match(transport.request?.prompt ?? "", /damaged battle variant/i);
  assert.match(transport.request?.prompt ?? "", /keep silhouette/);
  assert.match(transport.request?.prompt ?? "", /Avoid: photorealism/);
  assert.deepEqual(result.candidates.map((candidate) => Buffer.from(candidate.bytes).toString()), [
    "candidate-a", "candidate-b", "candidate-c",
  ]);
  assert.equal(result.model, "gpt-image-2.5-sunburst");
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test("accepts only variant Generation Packages", async () => {
  let loaded = false;
  let transported = false;
  const provider = new OpenAiImageGenerationProvider({
    apiKey: SECRET,
    loadReference: async () => {
      loaded = true;
      return { bytes: Uint8Array.from([1]), mediaType: "image/png", fileName: "hero.png" };
    },
    transport: { async edit() { transported = true; return { data: [] }; } },
  });

  await assert.rejects(() => provider.generate(variantPackage({ intent: "edit" })), /only accepts variant/);
  assert.equal(loaded, false);
  assert.equal(transported, false);
});

test("requires a source Approved Anchor before loading or transporting", async () => {
  let loaded = false;
  let transported = false;
  const provider = new OpenAiImageGenerationProvider({
    apiKey: SECRET,
    loadReference: async () => {
      loaded = true;
      return { bytes: Uint8Array.from([1]), mediaType: "image/png", fileName: "x.png" };
    },
    transport: { async edit() { transported = true; return { data: [] }; } },
  });
  const pkg = variantPackage({ references: [] });

  await assert.rejects(() => provider.generate(pkg), /Approved Anchor/);
  assert.equal(loaded, false);
  assert.equal(transported, false);
});

test("fails clearly when credentials are missing", () => {
  assert.throws(
    () => new OpenAiImageGenerationProvider({ apiKey: "   ", loadReference: async () => ({ bytes: new Uint8Array(), mediaType: "image/png", fileName: "x.png" }) }),
    /API key is required/,
  );
});

test("rejects empty reference bytes before transport", async () => {
  let transported = false;
  const provider = new OpenAiImageGenerationProvider({
    apiKey: SECRET,
    loadReference: async () => ({ bytes: new Uint8Array(), mediaType: "image/png", fileName: "hero.png" }),
    transport: { async edit() { transported = true; return { data: [] }; } },
  });

  await assert.rejects(() => provider.generate(variantPackage()), /image is empty/);
  assert.equal(transported, false);
});

test("rejects malformed provider responses without leaking credentials", async () => {
  const provider = new OpenAiImageGenerationProvider({
    apiKey: SECRET,
    loadReference: async () => ({ bytes: Uint8Array.from([1]), mediaType: "image/png", fileName: "hero.png" }),
    transport: { async edit() { return { data: [{ b64_json: undefined }] }; } },
  });

  await assert.rejects(async () => {
    try {
      await provider.generate(variantPackage());
    } catch (error) {
      assert.equal(String(error).includes(SECRET), false);
      throw error;
    }
  }, /malformed candidate/);
});

test("sanitizes non-success HTTP errors instead of exposing API response or key", async () => {
  const responseBody = `server echoed ${SECRET}`;
  const transport = new FetchOpenAiImageTransport(async () => new Response(responseBody, { status: 401 }));

  await assert.rejects(async () => {
    try {
      await transport.edit({
        model: "gpt-image-2.5-sunburst",
        prompt: "variant",
        size: "1024x1024",
        outputFormat: "png",
        background: "auto",
        candidateCount: 3,
        image: { bytes: Uint8Array.from([1]), mediaType: "image/png", fileName: "hero.png" },
      }, SECRET);
    } catch (error) {
      assert.equal(String(error).includes(SECRET), false);
      assert.equal(String(error).includes(responseBody), false);
      throw error;
    }
  }, /HTTP 401/);
});

test("rejects GPT Image 2.5-incompatible dimensions before transport", async () => {
  let transported = false;
  const provider = new OpenAiImageGenerationProvider({
    apiKey: SECRET,
    loadReference: async () => ({ bytes: Uint8Array.from([1]), mediaType: "image/png", fileName: "hero.png" }),
    transport: { async edit() { transported = true; return { data: [] }; } },
  });
  const pkg = variantPackage({
    output: { ...variantPackage().output, width: 128, height: 128 },
  });

  await assert.rejects(() => provider.generate(pkg), /output size is unsupported/);
  assert.equal(transported, false);
});

test("enforces the review-compatible 2-4 candidate bound", () => {
  assert.throws(
    () => new OpenAiImageGenerationProvider({
      apiKey: SECRET,
      candidateCount: 5,
      loadReference: async () => ({ bytes: Uint8Array.from([1]), mediaType: "image/png", fileName: "hero.png" }),
    }),
    /between 2 and 4/,
  );
});
