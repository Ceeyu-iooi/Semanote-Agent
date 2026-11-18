/** Explicit supplier evaluation of ten original synthetic cases; never loads the restricted corpus. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { annotate } from "../agent/agent.js";
import { taskTypes, validateResponse } from "../agent/contract.js";
import { generate } from "../agent/provider.js";
import { projectRoot, readJson, writeJson, exists } from "./lib/project.mjs";
const args = process.argv.slice(2),
  roundIndex = args.indexOf("--round"),
  numbers = args.includes("--all")
    ? Array.from({ length: 10 }, (_, index) => index + 1)
    : [Number(roundIndex < 0 ? 1 : args[roundIndex + 1])];
if (!args.includes("--remote") && !args.includes("--replay"))
  throw new Error(
    "Choose --remote for authorized synthetic requests, or --replay for captured offline candidates",
  );
const examples = await readJson(
    resolve(projectRoot, "examples/evaluation-cases.json"),
  ),
  settings = await readJson(
    resolve(projectRoot, "profile/runtime/model-providers.json"),
  );
const config = settings.providers.find((item) => item.id === "aliyun");
if (!config)
  throw new Error(
    "Configured Aliyun supplier is required; no automatic fallback",
  );
for (const number of numbers) {
  const example = examples[number - 1];
  if (!example) throw new Error("Round must be from 1 to 10");
  const labelIndex = args.indexOf("--run"),
    label = labelIndex < 0 ? "" : args[labelIndex + 1];
  if (label && !/^[a-z0-9-]+$/.test(label))
    throw new Error("Invalid run label");
  const directory = resolve(
    projectRoot,
    `profile/verification/immersive/model-round-${number}${label ? "/" + label : ""}`,
  );
  await mkdir(directory, { recursive: true });
  if (!args.includes("--replay") && await exists(resolve(directory, "result.json")))
    throw new Error("Evaluation receipt already exists; choose a new --run before any request");
  let calls = 0;
  const providerCall = async (supplier, text, tasks, context) => {
    calls++;
    const path = resolve(directory, `candidate-${calls}.json`);
    if (args.includes("--replay"))
      return {
        payload: await readJson(path),
        log: { promptTokens: null, completionTokens: null, cachedTokens: null },
      };
    const result = await generate(supplier, text, tasks, context);
    await writeJson(path, result.payload);
    return result;
  };
  const request = {
    requestId: randomUUID(),
    revisionId: randomUUID(),
    text: example.text,
    tasks: taskTypes,
  };
  const response = await annotate(request, config, {
    providerCall,
    useCache: !args.includes("--replay"),
  });
  validateResponse(request, response);
  let cacheCheck = null;
  if (response.status === "success" && !args.includes("--replay")) {
    let unexpected = 0;
    const cachedRequest = { ...request, requestId: randomUUID() },
      cached = await annotate(cachedRequest, config, {
        providerCall: async () => {
          unexpected++;
          throw new Error("Unexpected cache miss");
        },
      });
    validateResponse(cachedRequest, cached);
    cacheCheck = {
      status: cached.status,
      remoteCalls: unexpected,
      localCacheHits: cached.execution.localCacheHits,
      durationMs: cached.execution.durationMs,
    };
  }
  const summary = {
    round: number,
    name: example.name,
    mode: args.includes("--replay")
      ? "offline candidate replay"
      : "authorized synthetic supplier inference",
    status: response.status,
    passedLayers: taskTypes.filter(
      (task) => response.layers[task].status === "success",
    ).length,
    failedLayers: taskTypes
      .filter((task) => response.layers[task].status !== "success")
      .map((task) => ({ task, code: response.layers[task].error?.code })),
    actualRemoteCalls: args.includes("--replay") ? 0 : calls,
    execution: response.execution,
    cacheCheck,
  };
  await writeJson(
    resolve(
      directory,
      args.includes("--replay") ? "replay.json" : "result.json",
    ),
    { summary, request, response },
  );
  console.log(JSON.stringify(summary));
}
