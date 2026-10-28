"""Author editable Archify sources for the implemented Web system and GitFlow policy."""
import json
import argparse
from pathlib import Path
import subprocess

projectRoot = Path(__file__).resolve().parent.parent
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=projectRoot, text=True).strip()
repository = {"url": "https://github.com/Ceeyu-iooi/Semanote-Agent.git", "revision": revision, "link_mode": "local-only"}
javaRoot = "backend/src/main/java/io/semanote/"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--only", choices=["system-architecture", "frontend-architecture", "backend-architecture", "database-architecture", "git-workflow"])
selected = parser.parse_args().only


def source(path, line=1, end=None):
    return {"path": path, "line": line, **({"end_line": end} if end else {})}


def node(identity, kind, label, detail, x, y, sources, width=200, height=72):
    return {"id": identity, "type": kind, "label": label, "sublabel": detail, "pos": [x, y], "size": [width, height], "sources": sources}


def edge(start, end, label="", variant="default"):
    return {"id": start + "-" + end, "from": start, "to": end, "label": label, "variant": variant}


def architecture(name, title, nodes, edges, cards):
    payload = {"schema_version": 1, "diagram_type": "architecture", "meta": {"title": title, "locale": "zh-CN", "output": "docs/diagrams/" + name + ".html", "quality_profile": "showcase", "repository": repository}, "components": nodes, "connections": edges,
               "cards": [{"dot": "cyan" if index == 0 else "slate", "title": heading, "items": items} for index, (heading, items) in enumerate(cards)]}
    write(name, payload)


def write(name, payload):
    if selected and name != selected: return
    (projectRoot / "docs/diagrams" / (name + ".json")).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


architecture("system-architecture", "Semanote · B/S 系统框架", [
    node("browser", "external", "浏览器", "本机 / 授权局域网", 40, 40, [source("docs/web-contract.md", 7, 19)], 160),
    node("vue", "frontend", "Vue 工作台", "文本 · 标注 · 统计", 300, 40, [source("frontend/src/App.vue", 1, 25), source("frontend/src/api.js", 1, 14)]),
    node("spring", "backend", "Spring Boot 服务", "REST /api/v1 · 版本与任务", 640, 40, [source(javaRoot + "api/WorkspaceController.java", 15, 47), source(javaRoot + "service/JobService.java", 95, 115)]),
    node("agent", "backend", "Python 智能体", "本地 JSON 进程 · 四层校验", 980, 40, [source(javaRoot + "agent/AgentBridge.java", 28, 56), source("tools/agent_bridge.py", 17, 57)]),
    node("reference", "frontend", "开发者中心", "设计规范 · Archify · 变更", 300, 250, [source("frontend/src/components/DeveloperCenter.vue", 4, 23)]),
    node("mysql", "database", "MySQL 8.4", "修订 · 候选 · 保存快照", 640, 250, [source("backend/src/main/resources/schema.sql", 12, 63), source(javaRoot + "service/WorkspaceService.java", 143, 191)]),
    node("provider", "cloud", "所选模型服务", "默认 DeepSeek · 显式选择", 980, 250, [source("tools/agent_bridge.py", 46, 57), source("semanote_agent/providers.py", 1, 25)]),
], [edge("browser", "vue", "网页访问", "emphasis"), edge("vue", "spring", "HTTP JSON", "emphasis"), edge("spring", "agent", "stdin / stdout"), edge("vue", "reference", "同源资料"), edge("spring", "mysql", "JDBC 事务"), edge("agent", "provider", "同意后 HTTPS", "security")], [
    ("智能标注 + 人工修正", ["自动结果先存候选；显式保存才更新当前快照", "人工修正生成新版本，统计/导出固定同一保存快照"]),
    ("运行与数据边界", ["网页可显式开启局域网共享；MySQL 保持本机监听", "Host/Origin 白名单与网段防火墙限制；共享同一工作空间，无多用户分配"]),
])

architecture("frontend-architecture", "Semanote · Vue 前端框架", [
    node("app", "frontend", "Vue 应用状态", "文本库 · 工作台 · 统计", 40, 220, [source("frontend/src/App.vue", 8, 51), source("frontend/src/components/StatisticsView.vue", 1, 19)], height=96),
    node("canvas", "frontend", "AnnotationCanvas", "码点选区 · 重叠高亮", 420, 40, [source("frontend/src/components/AnnotationCanvas.vue", 1, 35)]),
    node("client", "frontend", "API 客户端", "fetch · 错误与请求边界", 420, 220, [source("frontend/src/api.js", 1, 14)]),
    node("developer", "frontend", "DeveloperCenter", "规范与 Archify 资料导航", 420, 400, [source("frontend/src/components/DeveloperCenter.vue", 1, 23)]),
    node("api", "backend", "Spring REST", "同源 /api/v1", 800, 220, [source(javaRoot + "api/WorkspaceController.java", 15, 47)]),
    node("tokens", "frontend", "共享设计变量", "Apple 来源 · Bootstrap 覆盖", 800, 400, [source("frontend/src/main.js", 1, 7), source("docs/design/tokens.css", 1, 56)]),
], [edge("app", "canvas", "原文与条目"), edge("app", "client", "用户操作", "emphasis"), edge("app", "developer", "开发者导航"), edge("client", "api", "HTTP JSON", "emphasis"), edge("developer", "tokens", "同一规范")], [
    ("数据流", ["保存回包绑定文档与编辑会话；冲突保留草稿并可载入最新版本", "统计页从保存快照读取；候选、草稿和历史分别标识"]),
    ("视觉与选区", ["业务页、开发者页、preview 共用 tokens.css", "浏览器 UTF-16 选区显式转 Unicode 码点；原文用文本节点渲染"]),
])

architecture("backend-architecture", "Semanote · Spring Boot 后端框架", [
    node("http", "backend", "HTTP 入口", "REST · 输入/来源边界", 40, 40, [source(javaRoot + "api/WorkspaceController.java", 15, 47), source(javaRoot + "api/LocalOriginFilter.java", 14, 28)]),
    node("services", "backend", "业务与任务服务", "版本事务 · 持久队列", 360, 40, [source(javaRoot + "service/WorkspaceService.java", 143, 191), source(javaRoot + "service/JobService.java", 95, 115)]),
    node("repository", "backend", "JDBC Repository", "参数化 SQL · JSON 聚合", 680, 40, [source(javaRoot + "data/WorkspaceRepository.java", 14, 40), source(javaRoot + "service/WorkspaceService.java", 174, 191)]),
    node("database", "database", "MySQL", "不可变修订与结果", 1000, 40, [source("backend/src/main/resources/schema.sql", 1, 63)]),
    node("bridge", "backend", "AgentBridge", "固定程序 · 超时/脱敏", 360, 280, [source(javaRoot + "agent/AgentBridge.java", 28, 56)]),
    node("python", "backend", "Python 适配入口", "人工转换 / 独立智能体", 680, 280, [source("tools/agent_bridge.py", 17, 57)]),
    node("provider", "cloud", "模型服务", "只有自动标注才联网", 1000, 280, [source("tools/agent_bridge.py", 46, 57)]),
], [edge("http", "services", "校验后调用", "emphasis"), edge("services", "repository", "事务读写", "emphasis"), edge("repository", "database", "JDBC SQL"), edge("services", "bridge", "事务外执行"), edge("bridge", "python", "JSON 管道"), edge("python", "provider", "明确同意后", "security")], [
    ("服务职责", ["WorkspaceService：修订、快照、统计与导出；ImportParser：UTF-8/CSV 校验", "JobService：任务先落库再排队，单工作线程，无自动重试/切换"]),
    ("可恢复状态", ["rowVersion 比较并更新；过期修订候选无法发布", "重启标记未完成任务中断；无完整回执时明确提示整份重提风险"]),
])

architecture("database-architecture", "Semanote · 数据库聚合框架", [
    node("document", "database", "textDocument", "标题 · 当前指针 · rowVersion", 40, 220, [source("backend/src/main/resources/schema.sql", 12, 22)]),
    node("revision", "database", "textRevision", "不可变原文 · hash · 修订号", 400, 220, [source("backend/src/main/resources/schema.sql", 23, 32)]),
    node("snapshot", "database", "annotationSnapshot", "修订/来源 · 已验证 layers", 760, 220, [source("backend/src/main/resources/schema.sql", 49, 62), source(javaRoot + "service/WorkspaceService.java", 143, 191)]),
    node("job", "database", "annotationJob", "请求 · 回执 · 尝试与状态", 400, 40, [source("backend/src/main/resources/schema.sql", 33, 48)]),
    node("import", "database", "importBatch", "文件身份 · 计数 · 来源追踪", 40, 420, [source("backend/src/main/resources/schema.sql", 6, 11), source(javaRoot + "service/WorkspaceService.java", 114, 134)]),
], [edge("document", "revision", "拥有修订", "emphasis"), edge("revision", "snapshot", "绑定同修订", "emphasis"), edge("revision", "job", "固定推理输入"), edge("job", "snapshot", "可选候选来源"), edge("import", "document", "逐格保留出现")], [
    ("聚合而非字段 ERD", ["条目、区间、标签、供应商尝试保存在经契约校验的 JSON 聚合", "schemaVersion 记录 V1 引导；完整物理字段与外键见 schema.sql"]),
    ("一致性", ["文档当前指针由服务事务维护，修订与快照不可变", "人工可直接建立快照或关联候选；即时导出不另存后台导出任务"]),
])

workflow = {"schema_version": 2, "diagram_type": "workflow", "meta": {"title": "Semanote · GitFlow 工作流规范", "locale": "zh-CN", "quality_profile": "showcase", "output": "docs/diagrams/git-workflow.html", "repository": repository},
 "lanes": [{"id": "development", "label": "功能开发与集成"}, {"id": "release", "label": "发布与版本"}, {"id": "hotfix", "label": "紧急修复", "variant": "exception"}],
 "nodes": [], "edges": [], "mainPath": ["develop", "feature", "review", "integrate", "release", "main", "tag"],
 "cards": [{"dot": "cyan", "title": "规范图，不是已发布历史", "items": ["保留 merge commit；功能不直接提交长期分支", "此图不表示分支保护已配置，也不表示已完成新版本发布"]}, {"dot": "slate", "title": "同步和公开边界", "items": ["release 合入 main 后同步 develop；hotfix 同步两者，有活动 release 时一并同步", "公开推送前核对白名单、暂存差异和凭据；不上传 profile 或真实语料"]}]}
for identity, lane, column, kind, label, detail in [
 ("develop", "development", 0, "backend", "develop", "集成起点"), ("feature", "development", 1, "backend", "feature/*", "本次功能开发"), ("review", "development", 2, "security", "PR 评审", "验证与白名单"), ("integrate", "development", 3, "backend", "develop 集成", "保留合并提交"),
 ("release", "release", 3, "backend", "release/X.Y.Z", "发布检查"), ("main", "release", 4, "backend", "main", "正式发布基线"), ("tag", "release", 5, "database", "vX.Y.Z", "不可移动标签"), ("hotfix", "hotfix", 4, "backend", "hotfix/X.Y.Z", "从 main 修复"), ("sync", "hotfix", 5, "backend", "PR 同步", "main / develop"),
]: workflow["nodes"].append({"id": identity, "lane": lane, "col": column, "type": kind, "label": label, "sublabel": detail, "sources": [source("docs/git-workflow.md", 3, 29)]})
for start, end, label in [("develop", "feature", "建分支"), ("feature", "review", "提交 PR"), ("review", "integrate", "通过后合并"), ("integrate", "release", "准备发布"), ("release", "main", "PR 合入"), ("main", "tag", "验证后打标"), ("main", "hotfix", "紧急修复"), ("hotfix", "sync", "评审合并")]: workflow["edges"].append(edge(start, end, label))
write("git-workflow", workflow)
print("Authored " + (selected or "five Archify sources") + " pinned to " + revision)
