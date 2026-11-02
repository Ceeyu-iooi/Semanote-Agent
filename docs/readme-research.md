# README 参考与格式提炼

2026-10-29 实际读取 20 个项目的完整 README（含 Spring Boot 的 AsciiDoc），通过公开 GitHub Contents API 获取原文及 blob 身份。只借鉴结构，不复制品牌、图像、文案、徽章或未经证实的指标。完整来源身份保留在本地研究回执。

| 项目与实际文件 | 提炼及本项目取舍 |
|---|---|
| [vuejs/core](https://github.com/vuejs/core/blob/main/README.md) | 价值与生态入口清楚；借用短导航，不复制赞助墙。 |
| [vitejs/vite](https://github.com/vitejs/vite/blob/main/README.md) | 开发体验先行，再进入包清单；首页不展开构建内部细节。 |
| [twbs/bootstrap](https://github.com/twbs/bootstrap/blob/main/README.md) | 下载、用法和维护入口分层；本项目保留唯一最快启动路径。 |
| [spring-projects/spring-boot](https://github.com/spring-projects/spring-boot/blob/main/README.adoc) | 快速入门与官方文档分开；Java选型进入架构表。 |
| [microsoft/vscode](https://github.com/microsoft/vscode/blob/main/README.md) | 真实界面展示后提供贡献/文档入口；用合成文本截图证明产品形态。 |
| [appsmithorg/appsmith](https://github.com/appsmithorg/appsmith/blob/release/README.md) | 产品图与核心能力相邻；用任务结果描述功能。 |
| [grafana/grafana](https://github.com/grafana/grafana/blob/main/README.md) | 使用、部署与开发路线分别链接；运行和开发恢复分开。 |
| [logseq/logseq](https://github.com/logseq/logseq/blob/master/README.md) | 产品价值与数据归属边界明确；补充本地profile隐私范围。 |
| [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw/blob/master/README.md) | 先呈现可操作画布，再解释协作能力；本项目原文先于统计。 |
| [penpot/penpot](https://github.com/penpot/penpot/blob/develop/README.md) | 界面证据连接设计与开发；共用设计规范而非另做营销主题。 |
| [gitui-org/gitui](https://github.com/gitui-org/gitui/blob/master/README.md) | 终端演示说明交互；以真实Git历史截图替代静态示意。 |
| [gitextensions/gitextensions](https://github.com/gitextensions/gitextensions/blob/master/README.md) | 安装与文档入口直接；维护工具按用途展开。 |
| [immich-app/immich](https://github.com/immich-app/immich/blob/main/README.md) | 产品预览与安装路径显著；不复制非本项目的规模数字。 |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch/blob/main/README.md) | 功能按用户任务组织；供应商与调用日志写进明确操作链。 |
| [ollama/ollama](https://github.com/ollama/ollama/blob/main/README.md) | 快速开始可复制；仅写本项目实际支持的供应商接入。 |
| [HumanSignal/label-studio](https://github.com/HumanSignal/label-studio/blob/develop/README.md) | 标注工具先说明任务与使用；明确自动候选与人工审核。 |
| [doccano/doccano](https://github.com/doccano/doccano/blob/master/README.md) | 任务类型、安装与示例形成闭环；保留十一层结果表。 |
| [infiniflow/ragflow](https://github.com/infiniflow/ragflow/blob/main/README.md) | 架构、演示与启动条件相互支撑；说明外发和推理边界。 |
| [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise/blob/main/README.md) | 用可视化展示Agent能力；不承诺不存在的工作流节点。 |
| [apache/superset](https://github.com/apache/superset/blob/master/README.md) | 产品介绍、截图和安装链接各司其职；课程证据收进折叠索引。 |

## 五次结构提炼

1. 汇总：价值句、真实产品证据、最短运行路径、文档入口是高频组成。
2. 去噪：去除赞助商墙、营销计数、虚拟徽章和与课程无关的生态宣传。
3. 按读者任务排序：理解产品 → 看到实际工作区 → 成功处理第一段文字 → 理解能力与边界 → 进入开发资料。
4. 校核：截图只用原创文本；命令全部Node；Java与智能体职责分开；版本链接只指真实0.1.1。
5. 视觉收敛：一张完整工作区、一张逐篇图谱，短导航与清晰表格；长开发索引折叠，窄屏不依赖固定宽HTML。

首页不宣称开源许可证已选择，不发布受限语料；新功能尚在功能分支时不写成已发布版本。
