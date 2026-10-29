/** Build locked Vue assets and Java; an explicit offline mode reuses a verified local JAR's dependencies. */
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  copyFile,
  lstat,
  realpath,
} from "node:fs/promises";
import { resolve, dirname, delimiter, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  projectRoot,
  toolRoot,
  run,
  exists,
  writeJson,
} from "./lib/project.mjs";
import { syncReference } from "./sync-reference.mjs";
import { releaseArtifact } from "./local-web.mjs";

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
async function removeOwned(root, path) {
  const absolute = await realpath(path);
  if (!absolute.startsWith(root + sep) || (await lstat(path)).isSymbolicLink())
    throw new Error("Refusing cleanup outside owned build directory");
  await rm(absolute, { recursive: true, force: true });
}
export async function offlineJava(baseline) {
  const ownedRoot = resolve(projectRoot, "profile/build");
  await mkdir(ownedRoot, { recursive: true });
  const buildRoot = await mkdtemp(resolve(ownedRoot, "java-")),
    unpacked = resolve(buildRoot, "package");
  await mkdir(unpacked);
  try {
    const copy = resolve(buildRoot, "baseline.jar");
    await copyFile(resolve(baseline), copy);
    const listing = (await run("jar", ["--list", "--file", copy])).stdout
      .toString("utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    if (
      listing.some(
        (name) =>
          name.startsWith("/") ||
          name.includes("\\") ||
          name.split("/").includes("..") ||
          /^META-INF\/[^/]+\.(SF|RSA|DSA)$/i.test(name),
      )
    )
      throw new Error("Unsupported baseline archive");
    await run("jar", ["--extract", "--file", copy], { cwd: unpacked });
    const classRoot = resolve(unpacked, "BOOT-INF/classes");
    await removeOwned(buildRoot, classRoot);
    await mkdir(classRoot);
    const libraryRoot = resolve(unpacked, "BOOT-INF/lib"),
      libraries = (await files(libraryRoot)).filter((path) =>
        path.endsWith(".jar"),
      ),
      sources = (
        await files(resolve(projectRoot, "backend/src/main/java"))
      ).filter((path) => path.endsWith(".java"));
    const dependencies = await Promise.all(
      libraries.map(async (path) => ({
        name: relative(libraryRoot, path).replaceAll("\\", "/"),
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      })),
    );
    await run(
      "javac",
      [
        "--release",
        "21",
        "-encoding",
        "UTF-8",
        "-g",
        "-parameters",
        "-cp",
        libraries.join(delimiter),
        "-d",
        classRoot,
        ...sources,
      ],
      { echo: true },
    );
    const resources = resolve(projectRoot, "backend/src/main/resources");
    for (const path of await files(resources)) {
      const target = resolve(classRoot, relative(resources, path));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(path, target);
    }
    const version = (
        await readFile(resolve(projectRoot, "VERSION"), "utf8")
      ).trim(),
      manifestPath = resolve(unpacked, "META-INF/MANIFEST.MF");
    let manifest = (await readFile(manifestPath, "utf8"))
      .replace(/\r/g, "")
      .replace(
        /Implementation-Version: [^\n]*/,
        `Implementation-Version: ${version}`,
      )
      .replace(
        /Created-By: [^\n]*/,
        "Created-By: Semanote offline JavaScript build",
      );
    manifest = manifest.trimEnd() + "\n\n";
    const manifestInput = resolve(buildRoot, "MANIFEST.MF");
    await writeFile(manifestInput, manifest);
    await rm(manifestPath);
    const metadata = resolve(
      unpacked,
      "META-INF/maven/io.semanote/semanote-web",
    );
    await mkdir(metadata, { recursive: true });
    await copyFile(
      resolve(projectRoot, "backend/pom.xml"),
      resolve(metadata, "pom.xml"),
    );
    await writeFile(
      resolve(metadata, "pom.properties"),
      `artifactId=semanote-web\ngroupId=io.semanote\nversion=${version}\n`,
    );
    const output = resolve(buildRoot, "release.jar");
    await run("jar", [
      "--create",
      "--file",
      output,
      "--manifest",
      manifestInput,
      "--no-compress",
      "-C",
      unpacked,
      ".",
    ]);
    const entries = (
      await run("jar", ["--list", "--file", output])
    ).stdout.toString("utf8");
    if (
      !entries.includes(
        "BOOT-INF/classes/io/semanote/SemanoteApplication.class",
      )
    )
      throw new Error("Incomplete executable JAR");
    const artifact = await releaseArtifact();
    await mkdir(dirname(artifact), { recursive: true });
    await rename(output, artifact);
    await writeJson(
      resolve(projectRoot, "profile/verification/immersive/build.json"),
      {
        mode: "explicit offline JDK 21",
        version,
        sourceFiles: sources.length,
        dependencies,
        sha256: createHash("sha256")
          .update(await readFile(artifact))
          .digest("hex"),
      },
    );
    console.log(
      `Built Java application offline: ${sources.length} sources, ${dependencies.length} unchanged runtime dependencies.`,
    );
  } finally {
    await removeOwned(ownedRoot, buildRoot);
  }
}
export async function buildWeb(args = process.argv.slice(2)) {
  try {
    if (!(await exists(resolve(projectRoot, "frontend/node_modules/vite"))))
      await run(
        "npm.cmd",
        ["ci", "--prefix", "frontend", "--no-audit", "--no-fund"],
        { echo: true },
      );
    await run("npm.cmd", ["--prefix", "frontend", "run", "build"], {
      echo: true,
    });
    await syncReference();
    const index = args.indexOf("--offline-from");
    if (index >= 0) {
      if (!args[index + 1])
        throw new Error("An existing verified JAR path is required");
      await offlineJava(args[index + 1]);
    } else
      await run(
        resolve(toolRoot, "maven/bin/mvn.cmd"),
        [
          "-f",
          "backend/pom.xml",
          `-Dmaven.repo.local=${resolve(projectRoot, "profile/maven-repository")}`,
          "package",
          "-q",
        ],
        { echo: true },
      );
    console.log("Built frontend/dist and " + (await releaseArtifact()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await buildWeb();
