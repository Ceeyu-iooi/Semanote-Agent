import { readFile } from "node:fs/promises";
import { annotate, manual } from "./agent.js";
import { validateResponse, requireValue } from "./contract.js";
import { parseStrictJson } from "./json.js";

try {
  const buffers = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    requireValue(bytes <= 8 * 1024 * 1024, "inputTooLarge");
    buffers.push(chunk);
  }
  const envelope = parseStrictJson(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(buffers)),
  );
  let result;
  if (envelope.action === "manual") result = manual(envelope);
  else if (envelope.action === "validateAutomatic")
    result = validateResponse(envelope.request, envelope.response);
  else {
    requireValue(
      envelope.action === "annotate" && envelope.remoteConsent === true,
      "remoteConsentRequired",
    );
    let config = envelope.providerConfig;
    if (!config) {
      const settings = JSON.parse(
        await readFile("profile/runtime/model-providers.json", "utf8"),
      );
      config = settings.providers.find(
        (item) => item.id === (envelope.provider || settings.provider),
      );
    }
    result = await annotate(envelope.request, config, {
      previousResponse: envelope.previousResponse,
      onProgress: (event) => {
        if (envelope.streamProgress)
          process.stdout.write(JSON.stringify(event) + "\n");
      },
    });
  }
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      error: {
        code: typeof error.code === "string" ? error.code : "invalidAnnotation",
        message: "智能体未完成，请检查输入、标注依赖或供应商配置。",
        retryable: false,
      },
    }) + "\n",
  );
  process.exitCode = 2;
}
