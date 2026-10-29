/** Read-only original identity, generated documentation and publication scope verification. */
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, extname, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { projectRoot, readJson, run, exists } from "./lib/project.mjs";
import { syncWorkflow } from "./sync-workflow.mjs";
import { parseCsv } from "./lib/csv.mjs";
const git = async (...args) =>
  (await run("git", args)).stdout.toString("utf8").trim();
async function verifyOriginals(auditData) {
  const manifestPath = resolve(projectRoot, "profile/manifest.json");
  if (!(await exists(manifestPath))) {
    if (auditData)
      throw new Error("Restricted originals absent; data audit cannot pass");
    console.log("SKIP originals: profile is absent in this checkout.");
    return;
  }
  const manifest = await readJson(manifestPath),
    profileRoot = resolve(projectRoot, "profile");
  if (manifest.files.length !== 5)
    throw new Error("Expected five original files");
  for (const entry of manifest.files) {
    const path = resolve(projectRoot, entry.localPath);
    if (!path.startsWith(profileRoot + sep))
      throw new Error("Original outside profile");
    const bytes = await readFile(path);
    if (
      bytes.length !== entry.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw new Error("Original identity changed");
  }
  console.log("PASS originals: five sizes and SHA-256 identities match.");
  if (auditData) {
    const bytes = await readFile(resolve(profileRoot, "data/train.csv"));
    if (!bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])))
      throw new Error("Expected UTF-8 BOM");
    const rows = parseCsv(
        new TextDecoder("utf8", { fatal: true }).decode(bytes),
      ),
      header = rows.shift();
    if (
      JSON.stringify(header) !== JSON.stringify(["案件A", "案件B", "案件C"]) ||
      rows.length !== 5102 ||
      rows.some((row) => row.length !== 3)
    )
      throw new Error("CSV shape changed");
    const texts = rows.flat();
    if (
      texts.length !== 15306 ||
      new Set(texts).size !== 1607 ||
      rows.length - new Set(rows.map((row) => JSON.stringify(row))).size !==
        6 ||
      texts.some((text) => !text.trim())
    )
      throw new Error("CSV baseline changed");
    console.log(
      "PASS corpus audit: 5102 rows, 15306 cells, 1607 exact unique texts, six repeated rows.",
    );
  }
}
async function verifyDocumentation() {
  await syncWorkflow({ check: true });
  const paths = [
    "README.md",
    ...(await readdir(resolve(projectRoot, "docs")))
      .filter((name) => name.endsWith(".md"))
      .map((name) => "docs/" + name),
  ];
  for (const name of paths) {
    const path = resolve(projectRoot, name),
      content = await readFile(path, "utf8");
    for (const match of content.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (target.includes("://") || target.startsWith("mailto:")) continue;
      const [file, anchor] = target.split("#"),
        destination = file ? resolve(dirname(path), file) : path;
      if (!(await exists(destination)))
        throw new Error(`Broken link in ${name}: ${target}`);
      if (
        anchor &&
        !(await readFile(destination, "utf8")).includes(`id="${anchor}"`)
      )
        throw new Error(`Missing explicit anchor: ${target}`);
    }
  }
  const html = await readFile(
    resolve(projectRoot, "docs/workflow.html"),
    "utf8",
  );
  if (
    /<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i.test(html) ||
    ["fetch(", "XMLHttpRequest", "new WebSocket", "eval("].some((word) =>
      html.includes(word),
    )
  )
    throw new Error("Offline workflow has external behavior");
  console.log("PASS local documentation links and self-contained workflow.");
}
async function verifyGit(expectGit) {
  if (!(await exists(resolve(projectRoot, ".git")))) {
    if (expectGit) throw new Error("Git missing");
    return;
  }
  const rootFiles = new Set([
      "README.md",
      "AGENTS.md",
      "CHANGELOG.md",
      "VERSION",
      ".gitignore",
      ".gitattributes",
      ".editorconfig",
      ".env.example",
    ]),
    images = new Set([
      "assets/readme/workspace.png",
      "assets/readme/insights.png",
    ]);
  const tracked = (await git("ls-files")).split("\n");
  for (const name of tracked) {
    if (
      !rootFiles.has(name) &&
      !images.has(name) &&
      ![
        "docs/",
        "tools/",
        ".github/",
        "agent/",
        "tests/",
        "examples/",
        "frontend/",
        "backend/",
      ].some((prefix) => name.startsWith(prefix))
    )
      throw new Error("Outside publication scope: " + name);
    const extension = extname(name).toLowerCase();
    if (
      ![
        "",
        ".md",
        ".json",
        ".html",
        ".css",
        ".js",
        ".mjs",
        ".vue",
        ".java",
        ".xml",
        ".properties",
      ].includes(extension) &&
      !rootFiles.has(name) &&
      !images.has(name) &&
      name !== "backend/src/main/resources/schema.sql" &&
      name !== "tools/configure_lan.ps1" &&
      !(name.startsWith("docs/licenses/") && extension === ".txt")
    )
      throw new Error("Unexpected public format: " + name);
    if (
      name
        .split("/")
        .some((part) =>
          ["profile", "node_modules", "target", "dist", "__pycache__"].includes(
            part,
          ),
        )
    )
      throw new Error("Tracked runtime/original data: " + name);
  }
  const ignored = await git(
    "check-ignore",
    "profile/manifest.json",
    "profile/data/train.csv",
    "deliverables/example.docx",
  );
  if (ignored.split("\n").length !== 3)
    throw new Error("Private ignore rules missing");
  if (expectGit) {
    if (
      (await git("remote", "get-url", "origin")) !==
      "https://github.com/Ceeyu-iooi/Semanote-Agent.git"
    )
      throw new Error("Unexpected remote");
    for (const branch of ["main", "develop"])
      await git("merge-base", "--is-ancestor", "v0.1.0-docs.1", branch);
    if (await git("status", "--porcelain"))
      console.log("NOTE working tree has changes; no clean-state claim.");
  }
  console.log(`PASS publication allowlist: ${tracked.length} tracked files.`);
}
try {
  await verifyDocumentation();
  await verifyOriginals(process.argv.includes("--audit-data"));
  await verifyGit(process.argv.includes("--expect-git"));
  console.log(
    "Initialization checks passed; business tests are reported separately.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
