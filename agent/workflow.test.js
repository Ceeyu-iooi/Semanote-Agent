import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
const evidenceRoot = resolve("profile/verification/immersive");
await mkdir(evidenceRoot, { recursive: true });
const testRoot = await mkdtemp(resolve(evidenceRoot, "agent-tests-"));
process.env.SEMANOTE_RUNTIME_ROOT = testRoot;
const { annotate } = await import("./agent.js");
const { cacheIdentity } = await import("./provider.js");
const { validateResponse } = await import("./contract.js");
after(async () => {
  assert.ok(testRoot.startsWith(evidenceRoot + sep));
  await rm(testRoot, { recursive: true });
});
const config = {
  id: "fixture",
  baseUrl: "https://example.org/v1",
  apiKey: "fixture-only",
  model: "test",
  timeoutSeconds: 20,
};
const source = "林晓喜欢阅读。";
const input = (tasks, text = source) => ({
  requestId: randomUUID(),
  revisionId: randomUUID(),
  text,
  tasks,
});
const usage = { promptTokens: 100, completionTokens: 30, cachedTokens: 0 };
const tokens = [
  ["林晓", "PROPN"],
  ["喜欢", "VERB"],
  ["阅读", "VERB"],
  ["。", "PUNCT"],
];

test("empty automatic intent, sentiment and semantic layers cannot claim success", async () => {
  for (const task of ["intent", "sentiment", "semantic"]) {
    const request = input([task]),
      result = await annotate(request, config, {
        useCache: false,
        providerCall: async () => ({ payload: { [task]: [] }, log: usage }),
      });
    assert.equal(result.layers[task].status, "failed");
    validateResponse(request, result);
  }
});
test("corrupt cache becomes one explicit request and is repaired", async () => {
  const request = input(["keywords"]),
    directory = resolve(testRoot, "annotation-cache");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, cacheIdentity(config, source) + ".json"),
    "{broken",
  );
  let calls = 0;
  const result = await annotate(request, config, {
    providerCall: async () => {
      calls++;
      return { payload: { keywords: ["阅读"] }, log: usage };
    },
  });
  assert.equal(result.status, "success");
  assert.equal(calls, 1);
  assert.equal(result.execution.cacheRepairs, 1);
});
test("cached incomplete semantic output is a miss, never a reported hit", async () => {
  const request = input(["semantic"]),
    directory = resolve(testRoot, "annotation-cache");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, cacheIdentity(config, source) + ".json"),
    JSON.stringify({ semantic: [] }),
  );
  const result = await annotate(request, config, {
    providerCall: async () => ({
      payload: { semantic: [[source, "OTHER", 0]] },
      log: usage,
    }),
  });
  assert.equal(result.status, "success");
  assert.equal(result.execution.localCacheHits, 0);
  assert.equal(result.execution.networkCalls, 1);
});
test("entity occurrence disambiguates the same word in separate contexts", async () => {
  const text = "小米是一种谷物。小米发布新手机。",
    request = input(["ner"], text),
    result = await annotate(request, config, {
      useCache: false,
      providerCall: async () => ({
        payload: { ner: [["小米", "ORGANIZATION", 1]] },
        log: usage,
      }),
    });
  assert.equal(result.layers.ner.result.items.length, 1);
  assert.equal(result.layers.ner.result.items[0].spans[0].start, 8);
  validateResponse(request, result);
});
test("POS retry sends and retains the successful segmentation", async () => {
  const request = input(["pos"]),
    first = await annotate(request, config, {
      useCache: false,
      providerCall: async () => ({
        payload: { tokens: tokens.map(([word]) => [word, "TIME"]) },
        log: usage,
      }),
    });
  assert.equal(first.layers.segmentation.status, "success");
  assert.equal(first.layers.pos.status, "failed");
  let supplied;
  const next = await annotate(request, config, {
    useCache: false,
    previousResponse: first,
    providerCall: async (_config, _text, _tasks, context) => {
      supplied = context.segmentation;
      return { payload: { tokens }, log: usage };
    },
  });
  assert.deepEqual(
    supplied,
    tokens.map((tuple) => tuple[0]),
  );
  assert.equal(next.status, "success");
  assert.equal(
    next.layers.segmentation.result.resultId,
    first.layers.segmentation.result.resultId,
  );
  validateResponse(request, next);
});
test("POS retry cannot replace retained words with a different tokenization", async () => {
  const request = input(["pos"]),
    first = await annotate(request, config, {
      useCache: false,
      providerCall: async () => ({
        payload: { tokens: tokens.map(([word]) => [word, "TIME"]) },
        log: usage,
      }),
    });
  const next = await annotate(request, config, {
    useCache: false,
    previousResponse: first,
    providerCall: async () => ({
      payload: {
        tokens: [
          ["林晓喜欢", "VERB"],
          ["阅读", "VERB"],
          ["。", "PUNCT"],
        ],
      },
      log: usage,
    }),
  });
  assert.equal(next.layers.pos.status, "failed");
  assert.equal(
    next.layers.segmentation.result.resultId,
    first.layers.segmentation.result.resultId,
  );
});
test("cross-chunk keyword ranking includes high-ranked later evidence", async () => {
  const text = "甲乙丙丁戊己庚辛壬癸。".repeat(60) + "重点。",
    request = input(["keywords"], text);
  const result = await annotate(request, config, {
    useCache: false,
    providerCall: async (_config, chunk) => ({
      payload: {
        keywords: chunk.includes("重点")
          ? ["重点", "甲"]
          : Array.from("甲乙丙丁戊己庚辛壬癸"),
      },
      log: usage,
    }),
  });
  assert.equal(result.status, "success");
  assert.ok(
    result.layers.keywords.result.items.some(
      (item) => item.itemText === "重点",
    ),
  );
  assert.equal(result.layers.keywords.result.items.length, 10);
});
test("a billed malformed response retains reported usage and unknown cached usage", async () => {
  const request = input(["ner"]);
  const result = await annotate(request, config, {
    useCache: false,
    providerCall: async () => {
      throw Object.assign(new Error("fixture"), {
        code: "invalidJson",
        log: {
          promptTokens: 37,
          completionTokens: 19,
          cachedTokens: null,
          providerRequestId: "fixture-request",
          resolvedModel: "fixture-model",
        },
      });
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.execution.promptTokens, 37);
  assert.equal(result.execution.completionTokens, 19);
  assert.equal(result.execution.cachedTokens, null);
  assert.equal(result.execution.usageKnown, true);
  assert.equal(result.layers.ner.attempts[0].resolvedModel, "fixture-model");
});
test("unknown usage is null and local paragraphs need no supplier", async () => {
  const failed = await annotate(input(["ner"]), config, {
    useCache: false,
    providerCall: async () => {
      throw new Error("fixture");
    },
  });
  assert.equal(failed.execution.promptTokens, null);
  const local = await annotate(input(["paragraphs"]), null, {
    providerCall: async () => {
      throw new Error("Unexpected call");
    },
  });
  assert.equal(local.status, "success");
  assert.equal(local.execution.networkCalls, 0);
  assert.equal(local.layers.paragraphs.attempts[0].provider, "local");
});

test("model whitespace tokens do not remove source layout or shift emoji offsets", async () => {
  const text = "你好😀！\r\n继续阅读。",
    request = input(["pos"], text),
    result = await annotate(request, config, {
      useCache: false,
      providerCall: async () => ({
        payload: {
          tokens: [
            ["你好", "INTJ"],
            ["😀", "SYM"],
            ["！", "PUNCT"],
            ["\r\n", "X"],
            ["继续", "ADV"],
            ["阅读", "VERB"],
            ["。", "PUNCT"],
          ],
        },
        log: usage,
      }),
    });
  assert.equal(result.status, "success");
  assert.equal(result.layers.segmentation.result.items[3].spans[0].start, 6);
  validateResponse(request, result);
});
