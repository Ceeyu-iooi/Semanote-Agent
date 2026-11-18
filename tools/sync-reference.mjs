/** Copy an explicit public allowlist to the browser's developer reference directory. */
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot, exists } from "./lib/project.mjs";
const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
export async function syncReference() {
  const source = await readFile(resolve(projectRoot, "CHANGELOG.md"), "utf8"),
    body = [], versions = [];
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const title = line.slice(3);
      const version = title.split(/\s/)[0];
      const id = "version-" + (version === "未发布" ? "unreleased" : version.replace(/[^\w.-]/g, "-"));
      versions.push(`<a href="#${id}">${escapeHtml(version)}</a>`);
      body.push(`<h2 id="${id}">${escapeHtml(title)}</h2>`);
    }
    else if (line.startsWith("### "))
      body.push("<h3>" + escapeHtml(line.slice(4)) + "</h3>");
    else if (line.startsWith("- "))
      body.push("<p class=entry>" + escapeHtml(line.slice(2)) + "</p>");
    else if (line && !line.startsWith("# "))
      body.push("<p>" + escapeHtml(line) + "</p>");
  }
  const page =
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Semanote · Changelog</title><link rel="stylesheet" href="design/tokens.css"><style>body{margin:0;padding:48px 32px;background:var(--color-canvas);color:var(--color-ink);font:400 17px/1.6 var(--font-body)}main{max-width:900px;margin:auto}h1{font-size:40px;font-weight:600}h2{font-size:28px;margin-top:48px;padding-top:24px;border-top:1px solid var(--color-border)}h3{font-size:21px}.eyebrow{color:var(--color-primary);font-size:12px;letter-spacing:1px}.entry{padding-left:17px;border-left:2px solid var(--color-border)}@media(max-width:640px){body{padding:24px 17px}h1{font-size:28px}}</style><main><p class="eyebrow">SEMANOTE / PROJECT HISTORY</p><h1>Changelog</h1>' +
    '<style>main{position:relative;max-width:1100px;padding-left:10rem;box-sizing:border-box}.version-nav{position:sticky;top:1rem;float:left;margin-left:-10rem;width:8.5rem;display:grid;gap:5px;border-left:1px solid var(--color-border);padding-left:12px;font-size:13px}.version-nav a{width:fit-content;padding:2px 8px;border-radius:8px;color:var(--color-ink);text-decoration:none}.version-nav a:hover,.version-nav a:focus-visible{background:var(--color-primary-soft)}h2:target{color:var(--color-focus);scroll-margin-top:1rem}@media(max-width:640px){main{padding-left:0}.version-nav{float:none;position:static;margin:0;width:auto;display:flex;flex-wrap:wrap}}</style>' +
    '<nav class="version-nav" aria-label="版本目录"><strong>版本</strong>' + versions.join("") + '</nav>' + body.join("") +
    "</main></html>\n";
  await writeFile(resolve(projectRoot, "docs/changelog.html"), page);
  const destination = resolve(projectRoot, "frontend/dist/reference");
  await mkdir(destination, { recursive: true });
  const copies = [];
  for (const name of [
    "dashboard-preview.html",
    "preview.html",
    "preview.css",
    "preview.js",
    "DESIGN.md",
    "tokens.css",
    "README.md",
    "apple/DESIGN.md",
    "apple/LICENSE",
    "apple/source.json",
  ])
    copies.push([
      `docs/design/${name}`,
      `frontend/dist/reference/design/${name}`,
    ]);
  for (const name of [
    "system-architecture",
    "agent-architecture",
    "frontend-architecture",
    "backend-architecture",
    "database-architecture",
    "git-workflow",
  ])
    copies.push([
      `docs/diagrams/${name}.html`,
      `frontend/dist/reference/diagrams/${name}.html`,
    ]);
  copies.push(
    ["docs/changelog.html", "frontend/dist/reference/changelog.html"],
    ["README.md", "frontend/dist/README.md"],
    ["LICENSE", "frontend/dist/LICENSE"],
    ["frontend/src/assets/semanote-mark.svg", "frontend/dist/frontend/src/assets/semanote-mark.svg"],
  );
  for (const name of await readdir(resolve(projectRoot, "docs/licenses")))
    copies.push([`docs/licenses/${name}`, `frontend/dist/licenses/${name}`]);
  for (const name of ["workspace.png", "insights.png", "dashboard.png", "system-framework.svg", "annotation-demo.png", "archify-system.png"])
    copies.push([
      `assets/readme/${name}`,
      `frontend/dist/assets/readme/${name}`,
    ]);
  for (const [from, to] of copies)
    if (await exists(resolve(projectRoot, from))) {
      const target = resolve(projectRoot, to);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(resolve(projectRoot, from), target);
    }
  console.log(
    "Developer references synchronized from explicit public sources.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await syncReference();
