/** Standalone Node CLI; consent is explicit and output creation never overwrites a file. */
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { annotate } from "./agent.js";
import { parseStrictJson } from "./json.js";
import { readJson } from "./provider.js";
import { validateRequest } from "./contract.js";
export async function main(args = process.argv.slice(2)) {
  const option = (name) => {
    const index = args.indexOf(name);
    return index < 0 ? null : args[index + 1];
  };
  if (args.includes("--help")) {
    console.log(
      "node agent/cli.mjs --input request.json --output result.json --consent [--provider id] [--previous result.json]",
    );
    return;
  }
  const input = option("--input"),
    output = option("--output");
  if (!input || !output) throw new Error("Input and output paths are required");
  try {
    await access(output);
    throw new Error("Output exists; choose a new path");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const request = parseStrictJson(
    new TextDecoder("utf8", { fatal: true }).decode(await readFile(input)),
  );
  validateRequest(request);
  if (
    !args.includes("--consent") &&
    request.tasks.some((task) => task !== "paragraphs")
  )
    throw new Error(
      "Use --consent only when authorized to send this input to the selected supplier",
    );
  const settings = await readJson(
      resolve("profile/runtime/model-providers.json"),
      { providers: [] },
    ),
    provider = option("--provider") || settings.provider,
    config = settings.providers.find((item) => item.id === provider);
  const previousPath = option("--previous"),
    previousResponse = previousPath
      ? parseStrictJson(
          new TextDecoder("utf8", { fatal: true }).decode(
            await readFile(previousPath),
          ),
        )
      : null;
  const result = await annotate(request, config, { previousResponse });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    `Annotation ${result.status}; ${result.execution.networkCalls} remote request(s).`,
  );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  try {
    await main();
  } catch (error) {
    console.error(error.code || error.message || "Annotation failed");
    process.exitCode = 2;
  }
