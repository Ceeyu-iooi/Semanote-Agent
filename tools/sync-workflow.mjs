/** Render the five documented stages from one JSON source; --check is read-only. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { projectRoot } from "./lib/project.mjs";

export function composePrompt(workflow, stage) {
  const dependency = stage.dependsOn.length
    ? stage.dependsOn.join("、") +
      " 已有用户验收证据；没有证据时先核实，不自动宣称通过。"
    : "无；核查当前项目与资料即可。";
  const decisions = stage.decisionIds.length
    ? stage.decisionIds.map((id) => `TBD[${id}]`).join("、") +
      "。只阻止依赖未确认决定的工作；是否已到最迟确认阶段以 docs/decisions.md 为准。"
    : "无本阶段新增必决策项；其他未决项仍按原清单保留。";
  return [
    `请在 Semanote-Agent 项目中执行 ${stage.id}：${stage.title}。`,
    "【项目边界】\n" + workflow.scope,
    "【本阶段目标】\n" + stage.goal,
    "【必读输入】\n" +
      [...workflow.commonRead, ...stage.requiredRead]
        .map((path) => "- " + path)
        .join("\n"),
    "【前置条件】\n" + dependency,
    "【待决策项】\n" + decisions,
    "【执行要求】\n" +
      stage.instructions.map((rule, i) => `${i + 1}. ${rule}`).join("\n"),
    "【预期产物】\n" +
      stage.deliverables.map((value) => "- " + value).join("\n"),
    "【验证与验收条件】\n" +
      stage.checks.map((value) => "- " + value).join("\n"),
    "【共同工作规范】\n" +
      workflow.commonRules.map((value) => "- " + value).join("\n"),
    "【停止位置】\n" + stage.stopCondition,
  ].join("\n\n");
}
export async function validateSource(workflow) {
  if (
    workflow.schemaVersion !== 2 ||
    workflow.stages.map((stage) => stage.id).join(",") !== "P01,P02,P03,P04,P05"
  )
    throw new Error("Expected five ordered stages P01–P05");
  const stages = new Map(workflow.stages.map((stage) => [stage.id, stage])),
    active = new Set(),
    visited = new Set();
  const [decisions, requirements] = await Promise.all(
    ["decisions", "requirements"].map((name) =>
      readFile(resolve(projectRoot, `docs/${name}.md`), "utf8"),
    ),
  );
  for (const stage of stages.values()) {
    for (const field of [
      "goal",
      "requiredRead",
      "instructions",
      "deliverables",
      "checks",
      "stopCondition",
    ])
      if (!stage[field]?.length)
        throw new Error(`Missing ${stage.id}.${field}`);
    if (
      !["pending", "prepared", "accepted", "inProgress"].includes(
        stage.status,
      ) ||
      !workflow.phases.some((phase) => phase.id === stage.phaseId)
    )
      throw new Error("Invalid phase or status");
    for (const id of stage.decisionIds)
      if (!decisions.includes(`| ${id} |`))
        throw new Error("Unknown decision " + id);
    for (const id of stage.requirementIds)
      if (!requirements.includes(`| ${id} |`))
        throw new Error("Unknown requirement " + id);
  }
  function visit(id) {
    if (active.has(id) || !stages.has(id))
      throw new Error("Invalid stage dependency");
    if (visited.has(id)) return;
    active.add(id);
    stages.get(id).dependsOn.forEach(visit);
    active.delete(id);
    visited.add(id);
  }
  for (const id of stages.keys()) visit(id);
}
export async function renderViews(workflow, rawSource) {
  const sourceHash = createHash("sha256").update(rawSource).digest("hex"),
    payload = {
      ...workflow,
      sourceWorkflowSha256: sourceHash,
      stages: workflow.stages.map((stage) => ({
        ...stage,
        promptText: composePrompt(workflow, stage),
      })),
    };
  const header = `<!-- Generated from workflow.json; SHA-256: ${sourceHash}. Do not edit this generated file. -->\n`,
    statusNames = {
      pending: "未开始",
      prepared: "产物待验收",
      accepted: "用户已验收",
      inProgress: "执行中",
    };
  const statusSummary = workflow.stages
    .map((stage) => `${stage.id} ${statusNames[stage.status]}`)
    .join("；");
  const promptLines = [
    header,
    "# 五步开发提示词\n",
    "设计数据库 → 写需求文档 → 智能体开发 → 后端开发 → 开发前端。每份代码块可独立复制，执行到依赖未决选型的位置再确认，不提前填写技术答案。\n",
    `当前状态：${statusSummary}。数据库先完成设计文档，后端步骤才按选定存储方案落地；智能体可独立验证，不依赖尚未开发的后端。\n`,
  ];
  const workflowLines = [
    header,
    "# 五步开发流程\n",
    workflow.flowNote + "\n",
    `唯一编辑源为 workflow.json。初始化已交付；当前状态：${statusSummary}。浏览或复制不会执行开发或改变验收状态。技术选型等未决项保持 TBD，分别在相关步骤实现前确认。\n`,
    "测试、统计、人工校对、导出、批量和课程交付检查点纳入相应步骤，不额外拆分主流程。\n",
    "[离线交互流程](workflow.html) · [五份完整提示词](prompts.md) · [待决策清单](decisions.md)\n",
  ];
  for (const phase of workflow.phases) {
    workflowLines.push(
      `## ${phase.title}\n`,
      phase.schedule + "\n",
      "| 阶段 | 依赖 | 状态 | 产物 |",
      "|---|---|---|---|",
    );
    for (const stage of payload.stages.filter(
      (stage) => stage.phaseId === phase.id,
    ))
      workflowLines.push(
        `| [${stage.id} ${stage.title}](prompts.md#${stage.id.toLowerCase()}) | ${stage.dependsOn.join("、") || "—"} | ${statusNames[stage.status]} | ${stage.deliverables.join("；")} |`,
      );
    workflowLines.push("");
  }
  workflowLines.push(
    "## 参考与表达\n",
    ...workflow.references.map((item) => `- [${item.title}](${item.url})`),
  );
  for (const stage of payload.stages)
    promptLines.push(
      `<a id="${stage.id.toLowerCase()}"></a>\n`,
      `## ${stage.id} ${stage.title}\n`,
      "```text",
      stage.promptText,
      "```\n",
    );
  const serialized = JSON.stringify(payload)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  const fragment = (
      await readFile(
        resolve(projectRoot, "tools/workflow-fragment.html"),
        "utf8",
      )
    ).replace("__WORKFLOW_DATA__", serialized),
    css = await readFile(
      resolve(projectRoot, "tools/workflow-offline.css"),
      "utf8",
    );
  const html =
    '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Semanote-Agent 开发步骤</title>\n<style>\n' +
    css +
    "\n</style>\n</head>\n<body>\n" +
    fragment +
    "\n<noscript>交互步骤需要 JavaScript。可直接阅读同目录 prompts.md 获取全部提示词。</noscript>\n</body>\n</html>\n";
  return {
    outputs: new Map([
      ["docs/prompts.md", promptLines.join("\n").trimEnd() + "\n"],
      ["docs/workflow.md", workflowLines.join("\n").trimEnd() + "\n"],
      ["docs/workflow.html", html],
    ]),
    fragment,
  };
}
export async function syncWorkflow({ check = false, preview = null } = {}) {
  const raw = await readFile(resolve(projectRoot, "docs/workflow.json")),
    workflow = JSON.parse(raw);
  await validateSource(workflow);
  const { outputs, fragment } = await renderViews(workflow, raw);
  if (preview) {
    const path = resolve(preview);
    if (
      !path.startsWith(projectRoot + "\\") &&
      !path.startsWith(projectRoot + "/")
    )
      throw new Error("Preview must stay inside this task checkout");
    outputs.set(path, fragment);
  }
  const stale = [];
  for (const [name, content] of outputs) {
    const path = resolve(projectRoot, name);
    if (check) {
      try {
        if ((await readFile(path, "utf8")).replaceAll("\r\n", "\n") !== content)
          stale.push(name);
      } catch {
        stale.push(name);
      }
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  }
  if (stale.length)
    throw new Error("Generated content is stale: " + stale.join(", "));
  console.log(
    `${check ? "Verified" : "Generated"} ${outputs.size} views; 5 complete prompts; source and dependencies valid.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const index = process.argv.indexOf("--preview");
    await syncWorkflow({
      check: process.argv.includes("--check"),
      preview: index >= 0 ? process.argv[index + 1] : null,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
