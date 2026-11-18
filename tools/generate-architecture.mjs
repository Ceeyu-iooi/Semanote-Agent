/** Maintain editable Archify JSON and pin source anchors to a concrete Git implementation commit. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectRoot, run } from "./lib/project.mjs";
const revision = (await run("git", ["rev-parse", "HEAD"])).stdout
  .toString("utf8")
  .trim();
const selected = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;
const paths = [
  "system-architecture",
  "agent-architecture",
  "frontend-architecture",
  "backend-architecture",
  "database-architecture",
  "git-workflow",
];
async function source(path, needle = null, count = 24) {
  const lines = (await readFile(resolve(projectRoot, path), "utf8")).trimEnd().split(
    "\n",
  );
  const line = needle
    ? lines.findIndex((value) => value.includes(needle)) + 1
    : 1;
  if (!line) throw new Error(`Missing source anchor ${path}: ${needle}`);
  return { path, line, end_line: Math.min(lines.length, line + count) };
}
for (const name of paths.filter((name) => !selected || name === selected)) {
  const path = resolve(projectRoot, `docs/diagrams/${name}.json`),
    diagram = JSON.parse(await readFile(path, "utf8"));
  diagram.meta.repository.revision = revision;
  const components = diagram.components || diagram.nodes;
  for (const component of components)
    for (const entry of component.sources || []) {
      const lines = (
        await readFile(resolve(projectRoot, entry.path), "utf8")
      ).split("\n").length;
      if (entry.line > lines)
        throw new Error("Source anchor no longer exists: " + entry.path);
    }
  if (name === "frontend-architecture") {
    const app = components.find((component) => component.id === "app");
    app.sublabel = "顶部导航 · 中央正文 · 抽取卡片";
    app.sources = [
      await source("frontend/src/App.vue", "const page ="),
      await source("frontend/src/components/ExtractionRail.vue"),
      await source("frontend/src/components/TopNavigation.vue"),
    ];
    components.find((component) => component.id === "developer").sources = [
      await source("frontend/src/components/DeveloperCenter.vue"),
      await source("frontend/src/components/ArchitectureExplorer.vue"),
    ];
  }
  if (name === "backend-architecture")
    for (const component of components)
      if (
        component.sources?.some((entry) =>
          entry.path.endsWith("/GitService.java"),
        )
      )
        component.sources = [
          await source(
            "backend/src/main/java/io/semanote/service/GitService.java",
            "public Object history",
          ),
          await source(
            "backend/src/main/java/io/semanote/service/GitService.java",
            "public Object changes",
          ),
        ];
  if (name === "agent-architecture") {
    const anchors = {
      input: ["agent/contract.js", "export function validateRequest"],
      planner: ["agent/agent.js", "export async function annotate"],
      cache: ["agent/provider.js", "export function cacheIdentity"],
      provider: ["agent/provider.js", "export async function generate"],
      logs: ["agent/provider.js", "const log ="],
      runner: ["agent/agent.js", "const modelTasks ="],
      guard: ["agent/contract.js", "export function validateCoverage"],
      result: ["agent/agent.js", "const successful ="],
    };
    for (const component of components)
      if (anchors[component.id]) {
        const [path, needle] = anchors[component.id];
        component.sources = [await source(path, needle, 30)];
      }
    diagram.cards[0].items = [
      "每块合并所选任务；跨块关键词汇总排名，词性重试固定已成功分词",
      "成功层缓存损坏按未命中处理，费用未知保持 null；真实检查点驱动抽取卡片",
    ];
  }
  if (name === "system-architecture")
    components.find((component) => component.id === "vue").sublabel =
      "顶部导航 · 沉浸标注 · 逐篇图表";
  await writeFile(path, JSON.stringify(diagram, null, 2) + "\n");
  console.log("Authored " + name + " pinned to " + revision);
}
