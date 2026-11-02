/** Controlled synthetic comparison: same model, text and four tasks; one-by-one versus joint. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { annotate } from "../agent/agent.js";
import { validateResponse } from "../agent/contract.js";
if (!process.argv.includes("--remote"))
  throw new Error(
    "Use --remote only for the authorized original synthetic benchmark",
  );
const runIndex = process.argv.indexOf("--run"),
  runName = runIndex < 0 ? null : process.argv[runIndex + 1];
if (!runName || !/^[a-z0-9-]+$/.test(runName))
  throw new Error("Provide a unique --run label");
const directory = "profile/verification/immersive/benchmark-" + runName;
await mkdir("profile/verification/immersive", { recursive: true });
// Reserve this run before any billed operation; an existing run is never overwritten.
await mkdir(directory);
const settings = JSON.parse(
    await readFile("profile/runtime/model-providers.json", "utf8"),
  ),
  config = settings.providers.find((item) => item.id === "aliyun");
const text =
  "2026年6月12日，林晓在杭州的向日葵书店支付120元购买图书。林晓十分满意，随后向陈明推荐这家书店。";
const makeRequest = (tasks) => ({
  requestId: randomUUID(),
  revisionId: randomUUID(),
  text,
  tasks,
});
const tasks = ["segmentation", "keywords", "pos", "ner"],
  baseline = [];
for (const task of tasks) {
  const request = makeRequest([task]),
    response = await annotate(request, config, { useCache: false });
  validateResponse(request, response);
  baseline.push({ task, status: response.status, ...response.execution });
}
const request = makeRequest(tasks),
  joint = await annotate(request, config);
validateResponse(request, joint);
const repeatRequest = makeRequest(tasks),
  repeat = await annotate(repeatRequest, config);
validateResponse(repeatRequest, repeat);
const total = (entries) =>
  Object.fromEntries(
    [
      "networkCalls",
      "promptTokens",
      "completionTokens",
      "cachedTokens",
      "durationMs",
    ].map((field) => [
      field,
      entries.reduce((sum, item) => sum + item[field], 0),
    ]),
  );
const receipt = {
  synthetic: true,
  provider: config.id,
  model: config.model,
  scope:
    "same text / same four core tasks; single local run, no monetary price inference",
  baseline,
  totalBaseline: total(baseline),
  joint: { status: joint.status, ...joint.execution },
  repeat: { status: repeat.status, ...repeat.execution },
};
await writeFile(directory + "/result.json", JSON.stringify(receipt, null, 2), {
  flag: "wx",
});
console.log(JSON.stringify(receipt));
