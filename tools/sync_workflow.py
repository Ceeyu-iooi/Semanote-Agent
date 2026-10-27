"""Generate documentation views from workflow.json using only the standard library.

This is documentation tooling, not a product scaffold. --check never writes files.
"""

import argparse
import hashlib
import json
from pathlib import Path


projectRoot = Path(__file__).resolve().parent.parent


def composePrompt(workflow, stage):
    """Return an independent prompt with inputs, gates, work and acceptance."""
    stagesById = {item["id"]: item for item in workflow["stages"]}
    dependencyText = "无；核查当前项目与资料即可。"
    if stage["dependsOn"]:
        dependencyText = "、".join(stage["dependsOn"]) + " 已有用户验收证据；没有证据时先核实，不自动宣称通过。"
    if stage["id"] == "P15":
        dependencyText += " 统计属于课程基本要求，可在 P13 后独立进行；P14 的人工修订同步在 P18 集中验证。"
    decisionsText = "无本阶段新增必决策项；其他未决项仍按原清单保留。"
    if stage["decisionIds"]:
        decisionsText = "、".join("TBD[" + value + "]" for value in stage["decisionIds"])
        decisionsText += "。只阻止依赖未确认决定的工作；是否已到最迟确认阶段以 docs/decisions.md 为准。"
    parts = [
        f"请在 Semanote-Agent 项目中执行 {stage['id']}：{stage['title']}。",
        "【项目边界】\n" + workflow["scope"],
        "【本阶段目标】\n" + stage["goal"],
        "【必读输入】\n" + "\n".join("- " + path for path in workflow["commonRead"] + stage["requiredRead"]),
        "【前置条件】\n" + dependencyText,
        "【待决策项】\n" + decisionsText,
        "【执行要求】\n" + "\n".join(f"{index}. {rule}" for index, rule in enumerate(stage["instructions"], 1)),
        "【预期产物】\n" + "\n".join("- " + value for value in stage["deliverables"]),
        "【验证与验收条件】\n" + "\n".join("- " + value for value in stage["checks"]),
        "【共同工作规范】\n" + "\n".join("- " + value for value in workflow["commonRules"]),
        "【停止位置】\n" + stage["stopCondition"],
    ]
    # Referenced predecessor IDs are validated before rendering.
    assert all(value in stagesById for value in stage["dependsOn"])
    return "\n\n".join(parts)


def validateSource(workflow):
    """Validate stable IDs and an acyclic dependency graph before writing."""
    stages = workflow["stages"]
    expectedIds = ["P00", "P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08a", "P08b", "P08c", "P08d"] + [f"P{number:02d}" for number in range(9, 21)]
    if [stage["id"] for stage in stages] != expectedIds:
        raise ValueError("Expected exactly P00–P20 with P08a–d in source order")
    stageById = {stage["id"]: stage for stage in stages}
    phaseIds = {phase["id"] for phase in workflow["phases"]}
    decisionText = (projectRoot / "docs/decisions.md").read_text(encoding="utf-8")
    requirementText = (projectRoot / "docs/requirements.md").read_text(encoding="utf-8")
    for stage in stages:
        for key in ("goal", "requiredRead", "instructions", "deliverables", "checks", "stopCondition"):
            if not stage.get(key):
                raise ValueError(f"Missing {key}: {stage['id']}")
        if stage["phaseId"] not in phaseIds or stage["status"] not in {"pending", "prepared", "accepted", "inProgress"}:
            raise ValueError(f"Invalid phase or status: {stage['id']}")
        for decisionId in stage["decisionIds"]:
            if f"| {decisionId} |" not in decisionText:
                raise ValueError(f"Unknown decision: {decisionId}")
        for requirementId in stage["requirementIds"]:
            if f"| {requirementId} |" not in requirementText:
                raise ValueError(f"Unknown requirement: {requirementId}")
    visited, active = set(), set()

    def visit(stageId):
        """Depth-first traversal rejects cycles and missing prerequisites."""
        if stageId in active:
            raise ValueError("Cyclic prerequisite: " + stageId)
        if stageId in visited:
            return
        if stageId not in stageById:
            raise ValueError("Unknown prerequisite: " + stageId)
        active.add(stageId)
        for dependencyId in stageById[stageId]["dependsOn"]:
            visit(dependencyId)
        active.remove(stageId)
        visited.add(stageId)

    for stageId in stageById:
        visit(stageId)


def renderViews(workflow, rawSource):
    """Build Markdown and a self-contained offline view from the same payload."""
    sourceHash = hashlib.sha256(rawSource).hexdigest()
    payload = dict(workflow)
    payload["sourceWorkflowSha256"] = sourceHash
    payload["stages"] = [dict(stage, promptText=composePrompt(workflow, stage)) for stage in workflow["stages"]]
    stageById = {stage["id"]: stage for stage in payload["stages"]}
    orderedStages = [stage for phase in workflow["phases"] for stage in payload["stages"] if stage["phaseId"] == phase["id"]]
    header = f"<!-- Generated from workflow.json; SHA-256: {sourceHash}. Do not edit this generated file. -->\n"
    promptLines = [header, "# 完整开发提示词\n", "每个代码块可独立复制，已包含共同边界。只执行当前指定阶段，结束后等待用户验收。技术选型保持 TBD，P03 确认后才能实现。\n", "编号用于定位，前置依赖决定执行顺序。P15 为课程必做统计，可在 P13 后先于人工校对开展；P16 同时依赖 P14 与 P15。\n"]
    workflowLines = [header, "# 开发流程\n", "唯一编辑源为 workflow.json，提示词和离线流程由同一内容生成。浏览阶段不会执行代码或改变验收状态。\n", "P00 的 prepared 表示产物已准备，尚待用户验收；其余阶段均未开始。当前仅有初始化文档，没有产品原型和业务软件。\n", "沿用参考博客的数据设计→PRD→后端→接口验证→前端主线，并补充课程中期、评估与验收。不得照搬博客的技术栈和登录等业务功能。\n", "P15 统计是基本要求，可在 P13 后独立实现；P14 人工校对是已选扩展。P16 需二者通过。编号不强制串行，依赖以表为准。\n", "[离线交互流程](workflow.html) · [完整提示词](prompts.md) · [待决策清单](decisions.md)\n"]
    statusNames = {"pending": "未开始", "prepared": "产物待验收", "accepted": "用户已验收", "inProgress": "执行中"}
    for phase in workflow["phases"]:
        workflowLines += [f"## {phase['title']}\n", phase["schedule"] + "\n", "| 阶段 | 依赖 | 状态 | 产物 |", "|---|---|---|---|"]
        for stage in orderedStages:
            if stage["phaseId"] == phase["id"]:
                dependencies = "、".join(stage["dependsOn"]) or "—"
                outputs = "；".join(stage["deliverables"])
                workflowLines.append(f"| [{stage['id']} {stage['title']}](prompts.md#{stage['id'].lower()}) | {dependencies} | {statusNames[stage['status']]} | {outputs} |")
        workflowLines.append("")
    workflowLines += ["## 参考与表达\n"] + [f"- [{item['title']}]({item['url']})" for item in workflow["references"]]
    for stage in payload["stages"]:
        promptLines += [f"<a id=\"{stage['id'].lower()}\"></a>\n", f"## {stage['id']} {stage['title']}\n", "```text", stage["promptText"], "```\n"]
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    fragment = (projectRoot / "tools/workflow-fragment.html").read_text(encoding="utf-8").replace("__WORKFLOW_DATA__", serialized)
    offlineCss = (projectRoot / "tools/workflow-offline.css").read_text(encoding="utf-8")
    offlineHead = "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Semanote-Agent 开发步骤</title>\n<style>\n"
    offlineTail = "\n<noscript>交互步骤需要 JavaScript。可直接阅读同目录 prompts.md 获取全部提示词。</noscript>\n</body>\n</html>\n"
    return {
        projectRoot / "docs/prompts.md": "\n".join(promptLines).rstrip() + "\n",
        projectRoot / "docs/workflow.md": "\n".join(workflowLines).rstrip() + "\n",
        projectRoot / "docs/workflow.html": offlineHead + offlineCss + "\n</style>\n</head>\n<body>\n" + fragment + offlineTail,
    }, fragment


def main():
    """Synchronize normal outputs; optionally emit a chat-owned preview fragment."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check without writing any file")
    parser.add_argument("--preview", type=Path, help="Also write the inline fragment to an explicit task-owned path")
    args = parser.parse_args()
    rawSource = (projectRoot / "docs/workflow.json").read_bytes()
    workflow = json.loads(rawSource)
    validateSource(workflow)
    outputs, fragment = renderViews(workflow, rawSource)
    if args.preview:
        outputs[args.preview.resolve()] = fragment
    stale = []
    for path, content in outputs.items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    if stale:
        raise SystemExit("Generated content is stale: " + ", ".join(stale))
    print(f"{'Verified' if args.check else 'Generated'} {len(outputs)} views; {len(workflow['stages'])} complete prompts; source and dependencies valid.")


if __name__ == "__main__":
    main()
