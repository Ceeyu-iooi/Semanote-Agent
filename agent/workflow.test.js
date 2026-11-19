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

test("shared evidence references preserve the same source and complete coverage across layers", async () => {
  const request = input(
    ["sentiment", "intent", "semantic", "relations", "events"],
    "林晓在杭州阅读。",
  );
  const payload = {
    evidence: [request.text],
    sentiment: [[0, "NEUTRAL"]],
    intent: [[0, "INFORM"]],
    semantic: [[0, "TOPIC"]],
    relations: [
      { itemText: 0, label: "位于", subject: "林晓", object: "杭州" },
    ],
    events: [
      {
        itemText: 0,
        label: "阅读",
        roles: { subject: ["林晓"], location: ["杭州"] },
      },
    ],
  };
  const response = await annotate(request, config, {
    useCache: false,
    providerCall: async () => ({ payload, log: usage }),
  });
  assert.equal(response.status, "success");
  for (const task of request.tasks)
    assert.equal(response.layers[task].result.items[0].itemText, request.text);
  validateResponse(request, response);
});
test("invalid shared evidence references fail without inventing text or retrying", async () => {
  let calls = 0;
  const request = input(["intent"]);
  const response = await annotate(request, config, {
    useCache: false,
    providerCall: async () => {
      calls++;
      return {
        payload: { evidence: [source], intent: [[2, "INFORM"]] },
        log: usage,
      };
    },
  });
  assert.equal(response.layers.intent.status, "failed");
  assert.equal(calls, 1);
});

test("progress reports real chunks and validation phase, preserves failures and never repeats a failed call", async () => {
  const events = [];
  let calls = 0;
  const response = await annotate(
    input(["ner", "keywords"], "林晓。".repeat(240)),
    config,
    {
      useCache: false,
      onProgress: (event) => events.push(structuredClone(event)),
      providerCall: async () => {
        calls++;
        throw Object.assign(new Error("fixture"), {
          code: "providerUnavailable",
        });
      },
    },
  );
  assert.equal(calls, response.execution.chunks);
  const checkpoints = events.filter((event) =>
    Number.isInteger(event.completedChunks),
  );
  assert.equal(checkpoints[0].completedChunks, 0);
  assert.equal(checkpoints.at(-1).completedChunks, calls);
  assert.ok(
    checkpoints.every(
      (event, index) =>
        index === 0 ||
        event.completedChunks >= checkpoints[index - 1].completedChunks,
    ),
  );
  assert.equal(events.at(-1).phase, "validating");
  assert.equal(events.filter((event) => event.status === "failed").length, 2);
});

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
test("POS retry ignores cached tags for a different retained segmentation", async () => {
  const request = input(["pos"]), unique = { ...config, model: randomUUID() };
  const first = await annotate(request, unique, { useCache: false, providerCall: async () => ({ payload: { tokens: tokens.map(([word]) => [word, "TIME"]) }, log: usage }) });
  await annotate(input(["pos"]), unique, { providerCall: async () => ({ payload: { tokens: [["林晓喜欢", "VERB"], ["阅读", "VERB"], ["。", "PUNCT"]] }, log: usage }) });
  let calls = 0;
  const next = await annotate(request, unique, { previousResponse: first, providerCall: async () => { calls++; return { payload: { tokens }, log: usage }; } });
  assert.equal(calls, 1); assert.equal(next.status, "success"); validateResponse(request, next);
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

test("POS retry accepts compact tags while preserving original word identities", async () => {
  const request = input(["pos"], "昨天上午，顾晓禾看书。");
  const first = await annotate(request, config, {
    useCache: false,
    providerCall: async () => ({
      payload: { segmentation: ["昨天", "上午", "顾晓禾", "看书"] },
      log: usage,
    }),
  });
  assert.equal(first.layers.segmentation.status, "success");
  assert.equal(first.layers.pos.status, "failed");
  const fixed = await annotate(request, config, {
    previousResponse: first, useCache: false,
    providerCall: async (_config, _text, _tasks, context) => {
      assert.deepEqual(context.segmentation, ["昨天", "上午", "，", "顾晓禾", "看书", "。"]);
      return { payload: { posLabels: [" noun ", "TIME", "PUNCT", "PROPN", "VERB", "PUNCT"] }, log: usage };
    },
  });
  assert.equal(fixed.layers.pos.status, "success");
  assert.deepEqual(fixed.layers.segmentation.result, first.layers.segmentation.result);
  assert.deepEqual(fixed.layers.pos.result.items.map(({ label }) => label), ["NOUN", "NOUN", "PUNCT", "PROPN", "VERB", "PUNCT"]);
});

test("small output budgets split long POS requests without dropping code points", async () => {
  const text = "甲乙丙丁。".repeat(45), request = input(["pos"], text);
  let calls = 0;
  const result = await annotate(request, { ...config, maxOutputTokens: 512 }, {
    useCache: false,
    providerCall: async (_config, chunk) => {
      calls++;
      assert.ok(Array.from(chunk).length <= 40);
      return { payload: { tokens: Array.from(chunk, (word) => [word, "NOUN"]) }, log: usage };
    },
  });
  assert.ok(calls > 1);
  assert.equal(result.layers.pos.status, "success");
  assert.equal(result.layers.pos.result.items.map(({ itemText }) => itemText).join(""), text);
});

test("indexed evidence selects the right repeated subject and restores complete intent coverage", async () => {
  const text = "顾晓禾借了地图。她说：“请登记归还。”顾晓禾去买书。";
  const request = input(["relations", "events", "intent", "sentiment"], text);
  const result = await annotate(request, config, {
    useCache: false,
    providerCall: async (_config, _source, _tasks, { sentences }) => {
      assert.equal(sentences.length, 3);
      const referent = { itemText: "顾晓禾", occurrences: [0] };
      return { log: usage, payload: {
        relations: [{ sentenceIndex: 1, label: "请求登记", subject: referent, object: "归还" }],
        events: [{ sentenceIndex: 1, label: "请求", roles: { subject: [referent], object: ["归还"] } }],
        intentLabels: ["INFORM", "REQUEST", "INFORM"],
        sentimentLabels: ["NEUTRAL", "NEUTRAL", "NEUTRAL"],
      } };
    },
  });
  assert.equal(result.status, "success");
  assert.equal(result.layers.events.result.items[0].roles.subject[0].spans[0].start, 0);
  assert.equal(result.layers.relations.result.items[0].subject.spans[0].start, 0);
  assert.equal(result.layers.intent.result.items.map(({ itemText }) => itemText).join(""), text);
});

test("long source keeps identical cache boundaries across different task sets", async () => {
  const text = "请把青石镇新地图交给工作人员。".repeat(51);
  const full = await annotate(input(["intent", "relations", "events"], text), config, {
    providerCall: async (_config, _text, _tasks, { sentences }) => ({
      payload: { intentLabels: sentences.map(() => "REQUEST"), events: [], relations: [] }, log: usage,
    }),
  });
  assert.equal(full.status, "success");
  assert.ok(full.execution.networkCalls > 1);
  const subset = await annotate(input(["intent"], text), config, {
    providerCall: async () => { throw Error("Validated cache should cover every chunk"); },
  });
  assert.equal(subset.status, "success");
  assert.equal(subset.execution.networkCalls, 0);
  assert.equal(subset.execution.localCacheHits, full.execution.networkCalls + full.execution.localCacheHits);
});
