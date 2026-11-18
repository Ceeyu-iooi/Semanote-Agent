import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardModel } from "../src/dashboardModel.js";

test("dashboard excludes archived texts and counts only actual task states", () => {
  const model = dashboardModel(
    [{ id: "a", archived: false }, { id: "b", archived: true }],
    [{ state: "queued" }, { state: "running" }, { state: "partialFailure" }, { state: "success" }],
    { savedCount: 1, itemCounts: { ner: 3, segmentation: 8, keywords: 0 }, entityLabels: { PERSON: 2, LOCATION: 1 } },
  );
  assert.equal(model.activeCount, 1);
  assert.deepEqual(model.recent.map((item) => item.id), ["a"]);
  assert.equal(model.running, 2);
  assert.equal(model.failed, 1);
  assert.deepEqual(model.rows.map((item) => item.key), ["segmentation", "ner"]);
  assert.equal(model.entityTotal, 3);
});

test("empty dashboard values do not invent data", () => {
  const model = dashboardModel();
  assert.equal(model.activeCount, 0);
  assert.equal(model.savedCount, 0);
  assert.equal(model.running, 0);
  assert.equal(model.entityTotal, 0);
  assert.deepEqual(model.rows, []);
});
