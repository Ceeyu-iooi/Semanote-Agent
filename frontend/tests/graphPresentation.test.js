import test from "node:test";
import assert from "node:assert/strict";
import {
  relationshipGraph,
  eventTime,
  groupRelationships,
} from "../src/graphPresentation.js";

test("opposite relationships share one link without losing evidence", () => {
  const edge = (id, from, to) => ({
    itemId: id,
    subject: { itemText: from },
    object: { itemText: to },
  });
  const groups = groupRelationships([edge("1", "a", "b"), edge("2", "b", "a"), edge("3", "a", "a")]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].records.map(item => item.itemId), ["1", "2"]);
  assert.equal(groups[1].records[0].itemId, "3");
});
test("relation display keeps directed edges, isolated people and literal evidence without inventing profiles", () => {
  const text = "😀林晓联系周宁。林晓在晨星公司工作。";
  const graph = relationshipGraph(
    [
      {
        itemId: "r1",
        itemText: "林晓联系周宁",
        label: "联系",
        subject: { itemText: "林晓" },
        object: { itemText: "周宁" },
      },
    ],
    [
      {
        itemText: "林晓",
        label: "PERSON",
        spans: [
          { start: 1, end: 3 },
          { start: 8, end: 10 },
        ],
      },
      { itemText: "周宁", label: "PERSON", spans: [{ start: 5, end: 7 }] },
      { itemText: "陈安", label: "PERSON", spans: [] },
    ],
    text,
  );
  assert.deepEqual(
    graph.nodes.map((node) => node.name),
    ["林晓", "周宁", "陈安"],
  );
  assert.equal(graph.edges[0].subject.itemText, "林晓");
  assert.equal(graph.nodes[0].count, 2);
  assert.ok(graph.nodes[0].evidence.includes("😀林晓联系周宁。"));
  assert.ok(
    graph.nodes.every((node) =>
      node.evidence.every((value) => text.includes(value)),
    ),
  );
});
test("event dates reject invalid dates and preserve partial or missing time without guessing", () => {
  const item = (value) => ({
    roles: { time: value ? [{ itemText: value }] : [] },
  });
  assert.equal(eventTime(item("2026年2月30日")).timestamp, null);
  assert.equal(eventTime(item("上午九点")).timestamp, null);
  assert.equal(eventTime(item("2026-05-01")).timestamp, Date.UTC(2026, 4, 1));
  assert.equal(eventTime(item()).value, "时间未标明");
});
