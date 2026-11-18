import { run } from "./lib/project.mjs";
import { deploymentSource } from "./lib/deployment-source.mjs";

try {
  const options = process.argv.slice(2);
  if (options.length > 1 || (options.length === 1 && !options[0].startsWith("--source=")))
    throw new Error("Usage: node tools/setup.mjs [--source=cn|--source=official]");
  const source = deploymentSource(options);

  await run(process.execPath, ["tools/download-web-tools.mjs", `--source=${source}`], { echo: true });
  await run(process.execPath, ["tools/local-web.mjs", "stop"], { echo: true });
  await run(process.execPath, ["tools/build-web.mjs", `--source=${source}`], { echo: true });
  await run(process.execPath, ["tools/local-web.mjs", "start"], { echo: true });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
