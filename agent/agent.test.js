import test, { after } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const evidenceRoot = resolve("profile/verification/immersive");
await mkdir(evidenceRoot, { recursive: true });
const testRoot = await mkdtemp(resolve(evidenceRoot, "legacy-tests-"));
process.env.SEMANOTE_RUNTIME_ROOT = testRoot;
const { annotate, manual, chunks } = await import("./agent.js");
const { cacheIdentity } = await import("./provider.js");
after(async () => {
  assert.ok(testRoot.startsWith(evidenceRoot + sep));
  await rm(testRoot, { recursive: true });
});
import {
  convertItems,
  positions,
  taskTypes,
  validateResponse,
  hash,
} from "./contract.js";

import { parseStrictJson } from "./json.js";
import { groundTokens, groundOrdered, sentenceEvidence } from "./grounding.js";

const config = {
  id: "test",
  baseUrl: "https://example.org/v1",
  apiKey: "fixture-only",
  model: "fixture",
  timeoutSeconds: 20,
  jsonMode: true,
};
const text = "林晓喜欢阅读。";
const payload = {
  tokens: [
    ["林晓", "PROPN"],
    ["喜欢", "VERB"],
    ["阅读", "VERB"],
    ["。", "PUNCT"],
  ],
  keywords: ["阅读"],
  ner: [["林晓", "PERSON"]],
  relations: [
    { itemText: text, label: "喜欢", subject: "林晓", object: "阅读" },
  ],
  events: [
    {
      itemText: text,
      label: "阅读",
      roles: { subject: ["林晓"], object: ["阅读"] },
    },
  ],
  sentiment: [[text, "POSITIVE", 0]],
  intent: [[text, "INFORM", 0]],
  semantic: [[text, "OTHER", 0]],
  errors: [],
};
const request = (tasks) => ({
  requestId: randomUUID(),
  revisionId: randomUUID(),
  text,
  tasks,
});
const reply = async () => ({
  payload,
  log: { promptTokens: 100, completionTokens: 50, cachedTokens: 60 },
});
test("all eleven layers round-trip, including dependent POS and event evidence", async () => {
  const input = request(taskTypes),
    output = await annotate(input, config, {
      providerCall: reply,
      useCache: false,
    });
  assert.equal(output.status, "success");
  assert.equal(output.execution.networkCalls, 1);
  validateResponse(input, output);
});
test("overlapping repeated matches use Unicode code points", () => {
  assert.deepEqual(positions("😀林晓😀林晓", "林晓"), [1, 4]);
  assert.deepEqual(positions("哈哈哈", "哈哈"), [0, 1]);
});
test("segmentation rejects omissions and handles punctuation deterministically", () => {
  assert.throws(() =>
    convertItems("segmentation", [{ itemText: "林晓" }], text),
  );
  assert.deepEqual(
    convertItems("segmentation", [{ itemText: "林晓喜欢阅读。" }], text).map(
      (item) => item.itemText,
    ),
    ["林晓喜欢阅读", "。"],
  );
});
test("lossless bounded long text chunks preserve emoji and source whitespace", () => {
  const source = "😀林晓。\r\n".repeat(1000),
    parts = chunks(source);
  assert.equal(parts.map((part) => part.text).join(""), source);
  assert.ok(parts.every((part) => Array.from(part.text).length <= 650));
});
test("relations with identical evidence and different endpoints remain separate", () => {
  const result = convertItems(
    "relations",
    [
      { itemText: text, label: "相关", subject: "林晓", object: "阅读" },
      { itemText: text, label: "相关", subject: "林晓", object: "喜欢" },
    ],
    text,
  );
  assert.equal(result.length, 2);
});
test("event roles refer only to occurrences inside their evidence", () => {
  const source = "林晓阅读。林晓喜欢阅读。",
    raw = [
      {
        itemText: "林晓喜欢阅读。",
        label: "阅读",
        roles: { subject: ["林晓"], object: ["阅读"] },
      },
    ];
  const [item] = convertItems("events", raw, source);
  assert.deepEqual(
    item.roles.subject[0].spans.map((span) => span.start),
    [5],
  );
  assert.throws(() =>
    convertItems(
      "events",
      [{ ...raw[0], roles: { subject: ["不存在"] } }],
      source,
    ),
  );
});
test("saved spans cannot be forged before publication", async () => {
  const input = request(taskTypes),
    output = await annotate(input, config, {
      providerCall: reply,
      useCache: false,
    });
  output.layers.events.result.items[0].roles.subject[0].spans[0].start++;
  assert.throws(() => validateResponse(input, output));
});
test("one layer failure retains other successes and explicit retry recovers it", async () => {
  const input = request(taskTypes);
  const first = await annotate(input, config, {
    providerCall: async () => ({
      payload: { ...payload, errors: undefined },
      log: {},
    }),
    useCache: false,
  });
  assert.equal(first.status, "partialFailure");
  const second = await annotate(input, config, {
    previousResponse: first,
    providerCall: reply,
    useCache: false,
  });
  assert.equal(second.status, "success");
  assert.equal(
    first.layers.ner.result.resultId,
    second.layers.ner.result.resultId,
  );
  validateResponse(input, second);
});
test("cache identity isolates endpoint, credential and model", () => {
  const key = cacheIdentity(config, text);
  for (const change of [
    { baseUrl: "https://other.example/v1" },
    { apiKey: "other" },
    { model: "other" },
  ])
    assert.notEqual(cacheIdentity({ ...config, ...change }, text), key);
});
test("cache reuse performs zero network calls and yields fresh result identity", async () => {
  const input = request(taskTypes);
  const unique = { ...config, model: randomUUID() };
  let count = 0;
  const providerCall = async () => {
    count++;
    return reply();
  };
  const first = await annotate(input, unique, { providerCall });
  const next = { ...input, requestId: randomUUID() },
    second = await annotate(next, unique, { providerCall });
  assert.equal(count, 1);
  assert.equal(second.execution.networkCalls, 0);
  assert.notEqual(
    first.layers.ner.result.resultId,
    second.layers.ner.result.resultId,
  );
  validateResponse(next, second);
});
test("manual semantic and error layers never apply suggestions to original text", () => {
  const source = "今天天汽很好。";
  const output = manual({
    text: source,
    revisionId: "r",
    layers: {
      errors: [
        {
          itemText: "天汽",
          label: "TYPO",
          suggestion: "天气",
          explanation: "错字",
        },
      ],
      paragraphs: [{ itemText: source }],
    },
  });
  assert.equal(
    output.layers.errors.result.items[0].spans[0].surfaceText,
    "天汽",
  );
  assert.equal(
    hash(source),
    hash(
      output.layers.paragraphs.result.items
        .map((item) => item.itemText)
        .join(""),
    ),
  );
});
test("POS-only selection automatically includes segmentation", async () => {
  const input = request(["pos"]),
    output = await annotate(input, config, {
      providerCall: reply,
      useCache: false,
    });
  assert.deepEqual(output.effectiveTasks, ["segmentation", "pos"]);
  validateResponse(input, output);
});
test("database JSON key order does not invalidate valid source spans", async () => {
  const input = request(taskTypes),
    output = await annotate(input, config, {
      providerCall: reply,
      useCache: false,
    });
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .reverse()
              .map((key) => [key, reorder(value[key])]),
          )
        : value;
  validateResponse(input, reorder(output));
});
test("strict JSON rejects duplicate keys, overflowing numbers and trailing content", () => {
  assert.throws(() => parseStrictJson('{"items":[],"items":[]}'));
  assert.throws(() => parseStrictJson('{"number":1e999}'));
  assert.throws(() => parseStrictJson("{}{}"));
  assert.deepEqual(parseStrictJson('{"a":[1,true,null,"\\\""]}'), {
    a: [1, true, null, '"'],
  });
});
test("grounding removes model-only punctuation while preserving all source letters", () => {
  const source = "你好！\r\n再见。";
  assert.equal(
    groundTokens(
      [
        ["你好", "INTJ"],
        ["！", "PUNCT"],
        ["。", "PUNCT"],
        ["再见", "VERB"],
        ["。", "PUNCT"],
      ],
      source,
    )
      .map(([word]) => word)
      .join(""),
    "你好！再见。",
  );
  assert.throws(() => groundTokens([["您好", "INTJ"]], source));
});
test("ordered sentence grounding resolves repeated fragments from source order", () => {
  assert.deepEqual(
    groundOrdered(
      [
        { itemText: "你好。", occurrence: 9 },
        { itemText: "你好。", occurrence: 9 },
      ],
      "你好。你好。",
    ).map((item) => item.occurrence),
    [0, 1],
  );
});
test("event context expansion never invents or rewrites source text", () => {
  const [item] = sentenceEvidence(
    [{ itemText: "明天继续阅读", label: "阅读" }],
    "我把书放好，明天继续阅读。",
  );
  assert.equal(item.itemText, "我把书放好，明天继续阅读。");
});
test("isolated surrogates cannot match a half of an original emoji", () => {
  assert.deepEqual(positions("😀甲", "\ude00"), []);
  assert.throws(() =>
    convertItems("keywords", [{ itemText: "\ude00" }], "😀甲"),
  );
});
test("paragraph-only annotation is lossless and makes no model call", async () => {
  const input = {
      ...request(["paragraphs"]),
      text: "你好。“再见！”\r\n继续阅读。",
    },
    output = await annotate(input, config, {
      providerCall: async () => {
        throw new Error("Unexpected model call");
      },
      useCache: false,
    });
  assert.equal(output.status, "success");
  assert.equal(output.execution.networkCalls, 0);
  assert.equal(
    output.layers.paragraphs.result.items.map((item) => item.itemText).join(""),
    input.text,
  );
  assert.ok(output.layers.paragraphs.result.items.length >= 3);
  validateResponse(input, output);
});
