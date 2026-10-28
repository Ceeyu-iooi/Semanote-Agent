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
parser.add_argument("--only", choices=["system-architecture", "agent-architecture", "frontend-architecture", "backend-architecture", "database-architecture", "git-workflow"])
selected = parser.parse_args().only


def source(path, line=1, end=None):
    length=len((projectRoot / path).read_text(encoding="utf-8").splitlines())
    if line>length: raise ValueError("Source anchor is outside file: "+path)
    return {"path": path, "line": line, **({"end_line": min(end,length)} if end else {})}


def anchor(path, needle, following=20):
    lines=(projectRoot/path).read_text(encoding="utf-8").splitlines()
    line=next(index+1 for index,text in enumerate(lines) if needle in text)
    return source(path,line,line+following)


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
    node("agent", "backend", "JavaScript 智能体", "Node.js · 十一层校验", 980, 40, [source(javaRoot + "agent/AgentBridge.java", 28, 56), source("agent/bridge.mjs", 5, 24)]),
    node("reference", "frontend", "独立开发者中心", "设计 · Archify · 实际 Git", 300, 250, [source("frontend/src/components/DeveloperCenter.vue", 4, 23), source("frontend/src/main.js", 1, 10)]),
    node("mysql", "database", "MySQL 8.4", "修订 · 候选 · 保存快照", 640, 250, [source("backend/src/main/resources/schema.sql", 12, 63), source(javaRoot + "service/WorkspaceService.java", 143, 191)]),
    node("provider", "cloud", "所选模型服务", "供应商注册表 · 显式选择", 980, 250, [source("agent/provider.js", 28, 65), source("agent/provider.js", 28, 65)]),
], [edge("browser", "vue", "网页访问", "emphasis"), edge("vue", "spring", "HTTP JSON", "emphasis"), edge("spring", "agent", "stdin / stdout"), edge("vue", "reference", "独立 /developer"), edge("spring", "mysql", "JDBC 事务"), edge("agent", "provider", "同意后 HTTPS", "security")], [
    ("智能标注 + 人工修正", ["自动结果先存候选；显式保存才更新当前快照", "人工修正生成新版本，统计/导出固定同一保存快照"]),
    ("运行与数据边界", ["网页可显式开启局域网共享；MySQL 保持本机监听", "Host/Origin 白名单与网段防火墙限制；共享同一工作空间，无多用户分配"]),
])

architecture("frontend-architecture", "Semanote · Vue 前端框架", [
    node("app", "frontend", "Vue 应用状态", "十一层工作台 · 逐篇统计", 40, 220, [source("frontend/src/App.vue", 8, 51), source("frontend/src/components/DocumentInsights.vue", 1, 35), source("frontend/src/components/ModelLogs.vue", 1, 20)], height=96),
    node("canvas", "frontend", "AnnotationCanvas", "码点选区 · 重叠高亮", 420, 40, [source("frontend/src/components/AnnotationCanvas.vue", 1, 30),source("frontend/src/annotationPresentation.js", 20, 45),source("frontend/src/components/PointerTip.vue",1,13)]),
    node("client", "frontend", "API 客户端", "fetch · 错误与请求边界", 420, 220, [source("frontend/src/api.js", 1, 14)]),
    node("developer", "frontend", "DeveloperCenter", "规范与 Archify 资料导航", 420, 400, [source("frontend/src/components/DeveloperCenter.vue", 1, 23)]),
    node("api", "backend", "Spring REST", "同源 /api/v1", 800, 220, [source(javaRoot + "api/WorkspaceController.java", 15, 47)]),
    node("tokens", "frontend", "共享设计变量", "Apple 来源 · Bootstrap 覆盖", 800, 400, [source("frontend/src/main.js", 1, 7), source("docs/design/tokens.css", 1, 56)]),
], [edge("app", "canvas", "原文与条目"), edge("app", "client", "用户操作", "emphasis"), edge("app", "developer", "独立 /developer"), edge("client", "api", "HTTP JSON", "emphasis"), edge("developer", "tokens", "同一规范")], [
    ("数据流", ["保存回包绑定文档与编辑会话；冲突保留草稿并可载入最新版本", "逐篇统计区分候选/草稿/保存快照；关系/事件卡片返回原文"]),
    ("视觉与选区", ["业务页、独立开发者页、preview 共用 tokens.css；十一层独立叠加", "浏览器 UTF-16 选区显式转 Unicode 码点；原文用文本节点渲染"]),
])

architecture("backend-architecture", "Semanote · Java 后端与本地配置框架", [
    node("http", "backend", "HTTP 入口", "REST · 来源边界", 40, 220, [source(javaRoot+"api/WorkspaceController.java",18,60),source(javaRoot+"api/LocalOriginFilter.java",14,28)],160),
    node("services", "backend", "版本与任务服务", "事务 · 队列 · 配置快照", 320, 220, [source(javaRoot+"service/WorkspaceService.java",146,194),source(javaRoot+"service/JobService.java",102,144)]),
    node("repository", "backend", "JDBC Repository", "参数化 SQL · JSON 聚合", 660, 220, [source(javaRoot+"data/WorkspaceRepository.java",14,40)],180),
    node("database", "database", "MySQL", "修订 · 候选 · 保存快照", 960, 220, [source("backend/src/main/resources/schema.sql",12,63)],180),
    node("settings", "backend", "供应商与日志服务", "密钥遮蔽 · 元数据筛选", 320, 20, [source(javaRoot+"service/ModelSettingsService.java",17,61),source(javaRoot+"service/ModelLogService.java",16,34)]),
    node("files", "database", "本地受限配置", "供应商注册表 · 调用元数据", 660, 20, [source(javaRoot+"service/ModelSettingsService.java",17,61),source(javaRoot+"service/ModelLogService.java",18,27)],180),
    node("bridge", "backend", "AgentBridge", "固定 Node 程序 · 超时", 320, 430, [source(javaRoot+"agent/AgentBridge.java",28,65)]),
    node("node", "backend", "JavaScript 智能体", "本地人工 / 远程合并推理", 660, 430, [source("agent/bridge.mjs",5,25),anchor("agent/agent.js","export async function annotate",47)],180),
    node("provider", "cloud", "所选模型", "只有自动标注才联网", 960, 430, [source("agent/provider.js",26,55)],180),
], [edge("http","services","业务请求","emphasis"),edge("services","repository","事务读写","emphasis"),edge("repository","database","JDBC"),edge("http","settings","设置/日志"),edge("services","settings","入队配置"),edge("settings","files","本地读写"),edge("services","bridge","事务外执行"),edge("bridge","node","JSON 管道"),edge("node","provider","明确同意后","security")], [
    ("一致性",["每个任务入队时固定配置；密钥不进入持久任务请求", "不可变修订和快照，乐观冲突返回 409，重启中断只显式恢复"]),
    ("本地资料",["MySQL 仅保存业务版本；配置与调用元数据保存在 profile", "智能体的推理缓存与日志写入路径见智能体框架；不回显原文或密钥"]),
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
 ("release", "release", 3, "backend", "release/X.Y.Z", "发布检查"), ("main", "release", 4, "backend", "main", "正式发布基线"), ("tag", "release", 5, "database", "X.Y.Z", "不可移动标签"), ("hotfix", "hotfix", 4, "backend", "hotfix/X.Y.Z", "从 main 修复"), ("sync", "hotfix", 5, "backend", "PR 同步", "main / develop"),
]: workflow["nodes"].append({"id": identity, "lane": lane, "col": column, "type": kind, "label": label, "sublabel": detail, "sources": [source("docs/git-workflow.md", 3, 29)]})
for start, end, label in [("develop", "feature", "建分支"), ("feature", "review", "提交 PR"), ("review", "integrate", "通过后合并"), ("integrate", "release", "准备发布"), ("release", "main", "PR 合入"), ("main", "tag", "验证后打标"), ("main", "hotfix", "紧急修复"), ("hotfix", "sync", "评审合并")]: workflow["edges"].append(edge(start, end, label))
write("git-workflow", workflow)
architecture("agent-architecture", "Semanote · JavaScript 智能体与缓存调度", [
    node("caller", "external", "Java 调用方", "JSON / NDJSON", 40, 220, [source(javaRoot+"agent/AgentBridge.java",28,65)],160),
    node("input", "security", "输入与恢复校验", "修订 · 任务 · 原文摘要", 300, 220, [source("agent/bridge.mjs",5,25),anchor("agent/contract.js","export function validateRequest",38)],180),
    node("planner", "backend", "分块与缓存调度", "650 码点 · 仅推理缺失层", 560, 220, [anchor("agent/agent.js","export async function annotate",47)],190),
    node("cache", "database", "本地成功层缓存", "端点/模型/规则/文本隔离", 560, 20, [source("agent/provider.js",10,12),anchor("agent/provider.js","export function cacheIdentity",0),anchor("agent/agent.js","const key=cacheIdentity",34)],190),
    node("runner", "backend", "多任务合并推理", "固定前缀 · 紧凑候选", 820, 220, [anchor("agent/agent.js","const modelTasks=",25),source("agent/prompts.js",1,18)],190),
    node("provider", "cloud", "所选兼容模型", "明确同意后 HTTPS", 1080, 220, [source("agent/provider.js",27,65),source("agent/bridge.mjs",12,17)],190),
    node("logs", "database", "本地调用元数据", "耗时 · usage · 脱敏错误", 1080, 20, [source("agent/provider.js",29,35),source("agent/provider.js",45,55)],190),
    node("guard", "security", "原文定位与合并", "完整覆盖 · 角色来源 · POS", 820, 430, [source("agent/grounding.js",1,30),source("agent/contract.js",43,110),anchor("agent/agent.js","for(const task of pending)",15)],190),
    node("result", "backend", "十一层候选回执", "成功/失败 · 身份与尝试", 560, 430, [anchor("agent/agent.js","const successful=",2)],190),
], [edge("caller","input","JSON","emphasis"),edge("input","planner","任务依赖","emphasis"),edge("planner","cache","按层读写"),edge("planner","runner","未命中","emphasis"),edge("runner","provider","HTTPS","security"),edge("provider","logs","调用元数据"),edge("provider","guard","候选"),edge("planner","guard","缓存命中"),edge("guard","result","校验","emphasis")], [
    ("成本与恢复",["每块合并所选任务；成功层可复用，失败不隐式重发", "缓存重新建立本次修订/结果身份；实际 usage 与本地复用分开记录"]),
    ("能力边界",["分词/关键词/词性/实体 + 分段/关系/事件/情感/意图/语义/错误", "原文不改写；跨块关系和歧义角色需校对，本轮百炼只测试合成文本"]),
])
print("Authored " + (selected or "six Archify sources") + " pinned to " + revision)
