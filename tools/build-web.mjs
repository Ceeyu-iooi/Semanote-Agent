import { run } from "./lib/project.mjs";
import { deploymentSource } from "./lib/deployment-source.mjs";
import { syncReference } from "./sync-reference.mjs";

try {
  const options = process.argv.slice(2);
  if (options.some((option) => !option.startsWith("--source="))) throw new Error("Usage: node tools/build-web.mjs [--source=cn|--source=official]");
  const source = deploymentSource(options);
  const npmRegistry = source === "cn" ? "https://repo.huaweicloud.com/repository/npm/" : "https://registry.npmjs.org/";
  const registry = ["--no-audit", "--no-fund", "--registry=" + npmRegistry];
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await Promise.all([
    run(npm, ["ci", "--prefix", "backend", "--omit=dev", ...registry], { echo: true }),
    run(npm, ["ci", "--prefix", "frontend", ...registry], { echo: true }),
  ]);
  await run(npm, ["--prefix", "frontend", "run", "build"], { echo: true });
  await syncReference();
  console.log("Built frontend/dist and installed backend runtime dependencies.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
