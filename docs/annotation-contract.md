# 0.1.1 活动智能体契约补充

JavaScript 入口：`node agent/bridge.mjs`，stdin 接收 action/envelope，stdout 输出 NDJSON 进度与唯一最终 JSON。Node.js 24，标准库 ESM。下方原契约 1.0.0 保留为历史和四项核心定义。

新增响应契约 **1.1.0**：原有字段/四类任务含义保留，layers 加入 paragraphs、relations、events、sentiment、intent、semantic、errors；execution 增加真实网络请求、本地缓存、块数、usage 及耗时，不改变结果跨度。Unicode 码点、左闭右开、原文摘要与修订绑定保持不变。已保存旧四层结果可继续读取/人工修订/导出；自动候选发布前以本地转换器重建并核验，忽略 JSON 对象字段顺序，不忽略数组顺序。

| 层 | 候选与结果 |
|---|---|
| paragraphs | 按序 itemText，拼接必须逐字等于原文（含全部空白）；本地按已有换行、句末及可用语义边界生成，展示只增加 CSS 换行 |
| relations | itemText/occurrence 证据、label、subject/object 原文词面；结果主客体各有独立原文 spans |
| events | itemText/occurrence 证据、label、roles.subject/object/time/location/cause/result 数组；角色逐字来自原文，优先事件证据内出现。唯一的上下文角色可指向其他位置；多处歧义须提供 {itemText,occurrences:[0起始序号]}，不存在的信息不得补造 |
| sentiment | 句子 itemText/occurrence、POSITIVE/NEGATIVE/NEUTRAL；所选层需覆盖各句非空白字符 |
| intent | itemText/occurrence、INFORM/REQUEST/QUESTION/COMMAND/PROMISE/OTHER |
| semantic | itemText/occurrence、TOPIC/LIST_ITEM/EXPLANATION/CONCLUSION/OTHER；列举分点以原文片段表示 |
| errors | itemText/occurrence、GRAMMAR/WORD_CHOICE/TYPO/PUNCTUATION、suggestion、explanation；修改建议独立保存，绝不直接改写原文 |

关系类型/事件类型为长度受限的说明标签，不把图表当作标准本体。全层自动与人工快照均经活动 JavaScript 校验。只保存部分图层仍需明确 allowPartial；统计、JSON/TXT/MD 始终固定同一已保存快照。旧 Python CLI 为 P03 历史兼容入口，Web 不再调用。

推理：每个最多 650 码点的原文块合并所选任务，一次返回紧凑候选，按原文位置合并；跨块关系/事件不强行推断，图中只展示有证据的候选，长距离跨块召回需人工补充。固定前缀、提示内容摘要、规则版本、供应商/端点/凭据摘要、模型/参数、文本摘要隔离本地按层缓存。结果失败不缓存，不隐式重试，显式重试保留已校验成功层。

---

# 智能体标注契约

阶段：P03；日期：2026-10-27；状态：用户已确认并实现，模块契约 `1.0.0`；P03 整体交付待验收。

依据：[PRD](PRD.md) F05–F09、F11–F15，[数据库逻辑设计](database.md)及[待决策清单](decisions.md)。用户已确认 Python 3.12 独立模块、命令行和大模型 API，首选 DeepSeek，并要求支持其他供应商。选择服务不等于授权外发真实语料。

## 1. 已确认的规则包

用户在本聊天三项确认中选择“采用整套规则”“采用该方案”“确认该契约”。以下“推荐候选”均已选择；替代列保留选择依据，不是运行时随机选项。TBD[D07] 的本阶段规则现已冻结。

| 项目 | 推荐候选 | 替代候选及影响 |
|---|---|---|
| 区间 | Unicode 码点，从 0 开始，左闭右开 `[start,end)`；原文不裁剪、不归一化、不改换行 | UTF-16 代码单元便于 JS/Java 直接切片，但 emoji 常占两单位；两者不能混用。推荐码点便于 Python 校验，后续浏览器/Java 边界处明确转换 |
| 分词 | 词语粒度；词项按原文顺序、无重叠，覆盖所有非空白字符；标点单列，空白只保留在原文 | 字符粒度较易校验但语言信息不足；保留空白为独立词项则需额外 POS 约定 |
| 词性 | 使用 Universal Dependencies 的 17 类通用词性；逐项引用同修订分词；仅选 POS 时显式补执行分词依赖并返回其结果 | 供应商原生标签更细但跨供应商不统一；独立 POS 会增加词项对齐差异 |
| 关键词 | 原文抽取式词条，去重并按重要性排序，最多 10 条，可少于 10 条或为空；记录所有精确出现区间，包括重复和相交出现；不生成分数 | 文档级无区间词条允许概括词但无法直接高亮或统计出现数；固定返回 10 条可能产生填充词 |
| 实体标签 | `PERSON` 人名、`LOCATION` 地名、`ORGANIZATION` 机构、`TIME` 日期/时间、`MONEY` 含币种或货币单位的金额 | 增加类别需要同步规则版本、验证与前端图例；普通数字不自动标成金额 |
| 实体重叠 | 允许嵌套和部分重叠，不同标签可共享区间；拒绝完全相同的“区间+标签”重复项；同词面的不同位置分别保留 | 禁止重叠便于平面展示，但会丢失嵌套表达；最终界面仍需逐项可访问 |

推荐词性集合为 `ADJ`、`ADP`、`ADV`、`AUX`、`CCONJ`、`DET`、`INTJ`、`NOUN`、`NUM`、`PART`、`PRON`、`PROPN`、`PUNCT`、`SCONJ`、`SYM`、`VERB`、`X`。`X` 仅表示不能归入其他类的词项，不用于隐瞒模型调用或校验失败。中文映射解释在冻结时逐项补齐。

关键词上限 10 是规则参数，不是质量指标。精确查找迭代枚举所有位置，不能只用第一次匹配；抽取式关键词必须至少出现一次。UD 标签依据见 [UD 官方定义](https://universaldependencies.org/u/pos/)，17 类及中文解释也可从 `semanote_agent.rules.posLabels` 获取。

## 2. 已冻结的输入输出和身份

本节是 TBD[D14] 中已经确认的独立模块契约；代码入口为 `semanote_agent.AnnotationAgent`。Web 路径、物理数据库结构及产品导出格式仍由 P04 确认。

- 输入携带请求身份、文本修订身份、完整原文和非空任务集合；四类任务分别为分词、关键词、词性、实体。
- 输出保留请求/修订身份、原文精确摘要、规则版本、自动来源、供应商/模型声明身份及逐层执行结果；每次实际尝试和成功结果均有独立身份。
- 同一组合请求各层分别报告状态。未请求层明确未执行；依赖补执行的分词单独标明来源，不能冒充用户主动选择。
- 成功层包含完整条目列表，允许规则认可的空列表；失败层无成功结果，并返回稳定错误代码和脱敏说明；总结果明确成功、部分失败或失败。
- 条目表达词面、顺序、适用标签、原文位置及依赖引用。分词/POS/实体逐项对应原文区间；关键词一个词条可对应多个位置。
- 接收方可据此构造人工新版本、保存快照、统计和 JSON 导出；智能体只生成候选结果，不写库、不改变当前快照、不覆盖人工版本。

模块契约版本为 `1.0.0`；这是模块格式版本，不更改项目发布版本。公开字段使用英文 lowerCamelCase：

| 对象 | 字段与含义 |
|---|---|
| 请求 | `requestId`、`revisionId`、`text`、`tasks`；任务值为 `segmentation`、`keywords`、`pos`、`ner`，不接受重复或未知任务 |
| 响应 | `contractVersion`、`requestId`、`revisionId`、`textHash`（原文 UTF-8 SHA-256）、`textLength`、`offsetUnit`、`requestedTasks`、`effectiveTasks`、`status`、`layers` |
| 层 | `taskType`、`selectionReason`（`requested`/`dependency`/`notRequested`）、`status`（`success`/`failed`/`notRequested`）、`attempts`、`result`、`error` |
| 成功结果 | `resultId`、`revisionId`、`specVersion`、`producerKind`（`automatic`）、`dependencyResultId`、`items`；失败/未执行时 `result` 为 null |
| 条目 | `itemId`、`itemText`、`spans`；POS/NER 有 `label`，POS 有 `tokenItemId`，关键词有从 1 开始的 `rank`；不添加没有依据的分数 |
| 区间 | `start`、`end`、`surfaceText`；每项检查 `text[start:end] == surfaceText`，分词/POS/实体的词面也必须相同 |
| 尝试 | `attemptId`、`provider`、请求的 `model`、供应商实际声明的 `resolvedModel`、`adapterVersion`、`promptVersion`、UTC `startedAt`/`finishedAt`、`status`、`providerRequestId`、`error`；未提供的供应商身份为 null，不包含原始响应或密钥 |
| 错误 | `code`、脱敏的 `message`、`retryable`；失败层必须有错误，成功/未执行层为 null |

响应 `layers` 固定列出四类；顶层 `status` 为 `success`、`partialFailure`、`failed`。顶层输入错误抛出明确的输入错误；命令行给出脱敏诊断并以非零状态退出，不发请求。依赖失败的 POS 可无实际供应商尝试，但有依赖错误；其他失败层保留真实尝试。

独立入口为 Python `AnnotationAgent.annotate(request)` 和 `python -m semanote_agent annotate --input <request.json>`；可选 `--output <result.json>`，输出文件已存在时拒绝覆盖。输入/输出文件只是显式调用资料，不构成数据库或 Web 服务。批量保存、快照与正式导出仍属 P04。

显式恢复入口为 `AnnotationAgent.retryFailed(request, previousResponse)` 或 CLI `--retry-from`。先校验原文摘要、修订、规则、已成功条目和依赖，再仅重试失败层，保留成功结果和旧尝试。即使 `python -O` 也执行校验。同一请求身份的跨进程去重由 P04 管理，P03 无持久化注册表，不声称重复运行 CLI 只计费一次。

TBD[D13] 中已确认的 P03 关联：修订和结果不可变，结果固定到输入修订；文本摘要不符拒绝混用；重新推理追加新结果；POS 固定引用其分词结果；显示、统计和导出由后续服务显式选择相同快照。P03 只冻结这些必要关联，草稿、归档、保留期和数据库并发仍由 P04/P05 确认。

## 3. 失败与恢复

- 非法任务、输入类型或修订身份在调用供应商前拒绝；具体空白/容量政策仍关联 TBD[D06]，不能偷偷截断文本。
- 网络、认证、限流、响应截断、空内容、非法 JSON、非法标签、越界和切片不符均为失败。
- 原文只作为待标注数据，原文内的指令不授予工具或配置修改权限；供应商输出只解析和校验，不执行。
- 分词失败时，依赖其结果的 POS 报依赖失败；关键词和实体可独立继续。其他层失败不能擦除本次成功层。
- 未经显式选择不换供应商，不把请求超时自动重发成另一笔推理。HTTPS I/O 超时默认 60 秒、输出上限 8192 tokens，不自动重试；显式重试失败层保留已有成功层和尝试证据。`retryable` 为恢复建议，不触发自动重发；调用方仍需核对超时后的实际情况。
- 不返回供应商原始错误正文、密钥、请求头或包含真实文本的诊断；不把模型自报分数当准确率或校准置信度。

## 4. 验证与未执行项

验证使用原创合成文本检查：四类分别/组合调用、POS 依赖、零结果、局部失败、越界、重复词、emoji/组合字符、CRLF、嵌套实体、文本变化、供应商切换和错误脱敏。

结构校验只能证明结果符合契约，不能证明语言学判断正确。未经人工建立并复核金标准，不报告 Precision/Recall/F1、准确率或达到质量阈值；TBD[D10] 继续保留。

28 项本地测试及真实 DeepSeek 合成文本调用记录见 [P03 交付记录](p03-report.md)。其他供应商只验证了适配协议，未声称远程接入通过；未向第三方发送受限语料。

## 5. 模型候选格式与公共输出的区别

模型不直接生成可信区间或系统身份：分词返回按序 `itemText`，本地顺序扫描且检查非空白覆盖；词性返回 `tokenIndex` 与 `label`；关键词返回原文词条，本地枚举全部出现；实体返回 `itemText`、`label` 和 0 起始 `occurrence`，本地定位所指定出现。实体位置合法不代表模型的实体语义判断必然正确。

适配器只接受完整 JSON 对象，不剥除 Markdown 围栏或默默截取片段；重复键、NaN、截断、空内容和非法候选均失败。最终公共条目由本地转换器建立；模型选择错误不会被包装为已经人工确认的标注。
