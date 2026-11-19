import { resolve } from "node:path";
import { run, toolRoot, projectRoot } from "./lib/project.mjs";
import { deploymentSource } from "./lib/deployment-source.mjs";
import { syncReference } from "./sync-reference.mjs";
import { releaseArtifact } from "./local-web.mjs";

try {
  const options = process.argv.slice(2);
  if (options.some((option) => !option.startsWith("--source="))) throw new Error("Usage: node tools/build-web.mjs [--source=cn|--source=official]");
  const source = deploymentSource(options);
  const npmRegistry = source === "cn" ? "https://repo.huaweicloud.com/repository/npm/" : "https://registry.npmjs.org/";
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await Promise.all([
    run(npm, ["ci", "--prefix", "frontend", "--no-audit", "--no-fund", "--registry=" + npmRegistry], { echo: true }),
    run(resolve(toolRoot, "maven/bin/mvn.cmd"), [
      ...(source === "cn" ? ["-s", resolve(projectRoot, "tools/maven-cn-settings.xml")] : []),
      "-f", "backend/pom.xml", "-Dmaven.repo.local=" + resolve(projectRoot, "profile/maven-repository"), "package",
    ], { echo: true }),
  ]);
  await run(npm, ["--prefix", "frontend", "run", "build"], { echo: true });
  await syncReference();
  console.log("Built frontend/dist and " + await releaseArtifact());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
