import assert from "node:assert/strict";
import test from "node:test";
import { frequencyGroups } from "../src/annotationPresentation.js";
import {
  resolveDisplayLayers,
  buildSegments,
  sourcePositions,
} from "../src/annotationPresentation.js";

test("frequency categories retain all exact occurrences and ignore duplicated positions", () => {
  const items = [
    {
      itemId: "1",
      itemText: "林晓",
      label: "PROPN",
      spans: [{ start: 0, end: 2 }],
    },
    {
      itemId: "2",
      itemText: "周宁",
      label: "PROPN",
      spans: [{ start: 3, end: 5 }],
    },
    {
      itemId: "3",
      itemText: "林晓",
      label: "PROPN",
      spans: [{ start: 6, end: 8 }],
    },
    {
      itemId: "4",
      itemText: "林晓",
      label: "PROPN",
      spans: [{ start: 6, end: 8 }],
    },
  ];
  assert.equal(frequencyGroups(items, "label")[0].count, 3);
  assert.equal(
    frequencyGroups(items, "term").find((group) => group.text === "林晓").count,
    2,
  );
  assert.equal(frequencyGroups(items, "label")[0].items.length, 4);
});

test("new pending inference never reports saved layers as returned progress", () => {
  const saved = {
    layers: { ner: { status: "success" }, pos: { status: "success" } },
  };
  assert.deepEqual(
    resolveDisplayLayers(
      null,
      { state: "queued", response: null, progress: null },
      saved,
    ),
    {},
  );
  const partial = { segmentation: { status: "success" } };
  assert.deepEqual(
    resolveDisplayLayers(
      null,
      { state: "running", progress: { layers: partial } },
      saved,
    ),
    partial,
  );
});
test("historical empty layers remain distinct from a candidate and current results", () => {
  assert.deepEqual(
    resolveDisplayLayers(
      { layers: {} },
      { response: { layers: { ner: { status: "success" } } } },
      { layers: { pos: { status: "success" } } },
    ),
    {},
  );
});

test("sweep preserves repeated overlapping highlights and exact source", () => {
  const keyword = {
    itemId: "k",
    task: "keywords",
    spans: [
      { start: 0, end: 2 },
      { start: 1, end: 3 },
    ],
  };
  const entity = {
    itemId: "n",
    task: "ner",
    label: "PERSON",
    spans: [{ start: 2, end: 4 }],
  };
  const result = buildSegments("哈哈哈😀", [keyword, entity], [2]);
  assert.equal(result.map((segment) => segment.text).join(""), "哈哈哈😀");
  assert.equal(result.find((segment) => segment.start === 2).matches.length, 2);
  assert.equal(result.find((segment) => segment.start === 3).matches.length, 1);
  assert.equal(result.find((segment) => segment.start === 2).breakBefore, true);
});

test("manual occurrence lookup includes overlapping source phrases", () => {
  assert.deepEqual(sourcePositions("哈哈哈", "哈哈"), [0, 1]);
  assert.deepEqual(sourcePositions("😀哈哈哈", "哈哈"), [1, 2]);
});
