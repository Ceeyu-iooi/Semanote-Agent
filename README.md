# Semanote-Agent

软件课程设计：文本标注智能体的设计与应用。

**当前发布版本：`0.1.0-docs.1`。P01 数据库逻辑设计已准备、待用户验收；尚无可运行的业务软件。**

目标是构建通用中文文本标注 Web 系统，完成分词、关键词、词性和命名实体标注，支持文本输入、编辑、导入、保存、高亮与统计，人工校对、JSON 导出和批量处理均已纳入规划。司法文本仅作本地示例语料，不提供司法分析或判断功能。技术确认范围及冲突见待决策清单。

当前交付：[数据库逻辑设计](docs/database.md)（含表/字段、关系、约束、生命周期、P02 问题和设计验收用例）。[P01 交付与验证记录](docs/p01-report.md) 区分本地核查、远程审阅和待用户验收；P02 尚未开始。

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
├── tools/                    # 仅文档同步与校验工具，无业务代码
└── profile/                  # 本机原件、清单和核查凭据，Git 忽略
    ├── course/               # 课程 PDF
    ├── templates/            # 中期、个人报告模板
    ├── data/                 # train.csv 与原始说明
    └── manifest.json         # 整理前后 SHA-256
```

公开仓库不包含 `profile`。克隆后可仅浏览文档；处理课程资料时，须从获授权的班级渠道取得原件并按清单放回本地。不得把缺少原件误判为可以下载未知来源的数据替代。

## 文档维护

使用现有 Python 3，无需安装依赖：

```powershell
python tools/sync_workflow.py
python tools/sync_workflow.py --check
python tools/verify_initialization.py
```

修改步骤、提示词或状态时只编辑 `docs/workflow.json`，再同步 Markdown 和离线流程。当前 P01 逻辑设计产物待验收，P02–P05 尚未开始；浏览、复制提示词不会改变完成状态。初始化基线独立保留，不计入这五个开发步骤。

Git 使用 [GitFlow 与版本规则](docs/git-workflow.md)。正式课程交付遵循 [提交清单](docs/submission-checklist.md)。本仓库尚未选择开源许可证；公开可见不等于已授予开源许可，第三方资料许可不变。
