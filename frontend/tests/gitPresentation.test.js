import test from "node:test";
import assert from "node:assert/strict";
import { buildGitGraph, parseUnifiedDiff } from "../src/gitPresentation.js";
test("actual parent links derive known main/develop and parallel paths without inventing branch names", () => {
  const rows = [
    {
      id: "d",
      parents: ["b", "r"],
      refs: "HEAD -> develop, origin/develop",
      subject: "sync",
    },
    {
      id: "m",
      parents: ["a", "r"],
      refs: "main, tag: 0.1.1",
      subject: "release",
    },
    { id: "r", parents: ["b"], refs: "", subject: "prepare" },
    { id: "b", parents: ["a", "f"], refs: "", subject: "integrate" },
    { id: "f", parents: ["a"], refs: "", subject: "feature" },
    { id: "a", parents: [], refs: "", subject: "initial" },
  ];
  const graph = buildGitGraph(rows),
    group = (id) => graph.nodes.find((node) => node.id === id).group;
  assert.equal(group("m"), "main");
  assert.equal(group("d"), "develop");
  assert.equal(group("r"), "release");
  assert.equal(group("f"), "feature");
  assert.ok(
    graph.nodes.find((node) => node.id === "a").x <
      graph.nodes.find((node) => node.id === "d").x,
  );
  assert.equal(graph.edges.length, 8);
});
test("unified diff keeps file boundaries, source text and independent old/new line numbers", () => {
  const patch =
    "diff --git a/source.js b/source.js\n--- a/source.js\n+++ b/source.js\n@@ -2,2 +2,2 @@\n keep\n-old\n+new\n";
  const [file] = parseUnifiedDiff(patch);
  assert.equal(file.path, "source.js");
  assert.deepEqual(
    file.hunks[0].lines.map((line) => [
      line.kind,
      line.oldNumber,
      line.newNumber,
      line.text,
    ]),
    [
      ["context", 2, 2, "keep"],
      ["delete", 3, null, "old"],
      ["add", null, 3, "new"],
    ],
  );
});

test("live release and hotfix refs color the full first-parent path up to known mainlines", () => {
  const rows = [
    { id: "r2", parents: ["r1"], refs: "HEAD -> release/next" },
    { id: "r1", parents: ["d"], refs: "" },
    { id: "h2", parents: ["h1"], refs: "origin/hotfix/correction" },
    { id: "h1", parents: ["m"], refs: "" },
    { id: "d", parents: ["a"], refs: "develop" },
    { id: "m", parents: ["a"], refs: "main" },
    { id: "a", parents: [], refs: "" },
  ].map((row) => ({ ...row, subject: row.id }));
  const graph = buildGitGraph(rows),
    group = (id) => graph.nodes.find((node) => node.id === id).group;
  assert.equal(group("r2"), "release");
  assert.equal(group("r1"), "release");
  assert.equal(group("h2"), "hotfix");
  assert.equal(group("h1"), "hotfix");
  assert.equal(group("d"), "develop");
  assert.equal(group("m"), "main");
});
