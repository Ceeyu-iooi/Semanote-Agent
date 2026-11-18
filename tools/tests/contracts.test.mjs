import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { parseCsv } from "../lib/csv.mjs";
import { run, projectRoot } from "../lib/project.mjs";
const root = resolve(projectRoot, "profile/verification/immersive");
await mkdir(root, { recursive: true });
const own = await mkdtemp(resolve(root, "cli-tests-"));
after(async () => {
  assert.ok(own.startsWith(root + sep));
  await rm(own, { recursive: true });
});
test("CSV preserves quoted newlines, escaped quotes and empty trailing fields", () => {
  assert.deepEqual(parseCsv('a,b,c\r\n"x\r\ny","say ""hi""",\r\n'), [
    ["a", "b", "c"],
    ["x\r\ny", 'say "hi"', ""],
  ]);
  assert.throws(() => parseCsv('"unclosed'));
  assert.throws(() => parseCsv('"a"z'));
});
test("CLI runs local paragraphs without consent and refuses overwrite", async () => {
  const input = resolve(own, "request.json"),
    output = resolve(own, "result.json");
  await writeFile(
    input,
    JSON.stringify({
      requestId: randomUUID(),
      revisionId: randomUUID(),
      text: "你好😀。\r\n再见。",
      tasks: ["paragraphs"],
    }),
  );
  await run(process.execPath, [
    "agent/cli.mjs",
    "--input",
    input,
    "--output",
    output,
  ]);
  const saved = await readFile(output, "utf8"),
    result = JSON.parse(saved);
  assert.equal(result.status, "success");
  assert.equal(result.execution.networkCalls, 0);
  const retry = await run(
    process.execPath,
    ["agent/cli.mjs", "--input", input, "--output", output],
    { check: false },
  );
  assert.equal(retry.code, 2);
  assert.equal(await readFile(output, "utf8"), saved);
});
test("CLI rejects invalid input and remote tasks without consent before network", async () => {
  for (const request of [
    { tasks: null },
    {
      requestId: randomUUID(),
      revisionId: randomUUID(),
      text: "原创文本。",
      tasks: ["ner"],
    },
  ]) {
    const input = resolve(own, randomUUID() + ".json");
    await writeFile(input, JSON.stringify(request));
    const result = await run(
      process.execPath,
      [
        "agent/cli.mjs",
        "--input",
        input,
        "--output",
        resolve(own, randomUUID() + ".json"),
      ],
      { check: false },
    );
    assert.equal(result.code, 2);
  }
});
