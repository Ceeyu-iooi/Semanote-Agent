# Semanote-Agent

软件课程设计：文本标注智能体的设计与应用。

**当前发布版本：`0.1.0-docs.1`。P03 已获继续执行准入；用户已授权 P04/P05，Web 系统已实现并完成本地交付检查，P04/P05 待用户验收；未发布新版本。**

目标是构建通用中文文本标注 Web 系统，完成分词、关键词、词性和命名实体标注，支持文本输入、编辑、导入、保存、高亮与统计，人工校对、JSON 导出和批量处理均已纳入规划。司法文本仅作本地示例语料，不提供司法分析或判断功能。技术确认范围及冲突见待决策清单。

本地启动：`python -X utf8 -B tools/local_web.py start`；浏览器打开 `http://127.0.0.1:8080`。

Web 入口：[启动、操作、备份与恢复](docs/web-usage.md) · [Web 契约](docs/web-contract.md) · [共享设计规范与 preview](docs/design/README.md)。

原有 P03 交付：[独立智能体](semanote_agent/__init__.py)、[标注契约](docs/annotation-contract.md)、[使用与恢复说明](docs/agent-usage.md)、[Archify 交互式原理图](docs/diagrams/agent-architecture.html)及 [P03 交付记录](docs/p03-report.md)。需求与数据依据保留在 [PRD](docs/PRD.md)、[数据库逻辑设计](docs/database.md)和[待决策清单](docs/decisions.md)；阶段准入见[验收记录](docs/acceptance.md)，P01/P02 记录保留历史事实。

## 从这里开始

1. 阅读 [Agent 工作规范](AGENTS.md) 和 [课程要求映射](docs/requirements.md)。
2. 查看 [开发流程](docs/workflow.md) 或直接打开 [离线交互流程](docs/workflow.html)。
3. 在 [五份完整提示词](docs/prompts.md) 中复制当前步骤：**设计数据库 → 写需求文档 → 智能体开发 → 后端开发 → 开发前端**。
4. 按阶段交付、验证和验收；不要直接执行后续全部提示词。技术决策从 [待决策清单](docs/decisions.md) 读取。

## 目录

```text
Semanote-Agent/
├── AGENTS.md                 # 项目与 Agent 约束
├── README.md
├── CHANGELOG.md
├── VERSION
├── docs/                     # 规范、提示词、流程及验收清单
│   └── workflow.json         # 阶段和完整提示词的唯一编辑源
├── frontend/                 # Vue/JavaScript/Bootstrap，生产静态资源在 dist
├── backend/                  # Java/Spring Boot/JDBC/MySQL
├── semanote_agent/           # 独立智能体，Python 3.12 标准库
├── tests/                    # 本地契约、恢复、协议与 CLI 测试
├── examples/                 # 原创合成请求和独立调用示例
├── tools/                    # 文档同步、基线与公开范围校验
└── profile/                  # 本机原件、清单和核查凭据，Git 忽略
    ├── course/               # 课程 PDF
    ├── templates/            # 中期、个人报告模板
    ├── data/                 # train.csv 与原始说明
    └── manifest.json         # 整理前后 SHA-256
```

公开仓库不包含 `profile` 或真实 API Key。独立智能体从源码运行无需安装依赖，配置和调用见[使用说明](docs/agent-usage.md)；处理课程资料时，须从获授权的班级渠道取得原件并按清单放回本地。不得把缺少原件误判为可以下载未知来源的数据替代。

## 文档维护

使用现有 Python 3，无需安装依赖：

```powershell
python tools/sync_workflow.py
python tools/sync_workflow.py --check
python tools/verify_initialization.py
```

修改步骤、提示词或状态时只编辑 `docs/workflow.json`，再同步 Markdown 和离线流程。当前 P01/P02/P03 为 accepted（见阶段准入证据），P04/P05 已获本次实施授权，状态以 workflow.json 为准；浏览、复制提示词不会改变完成状态。初始化基线独立保留，不计入这五个开发步骤。

Git 使用 [GitFlow 与版本规则](docs/git-workflow.md)。正式课程交付遵循 [提交清单](docs/submission-checklist.md)。本仓库尚未选择开源许可证；公开可见不等于已授予开源许可，第三方资料许可不变。
