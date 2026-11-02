# JavaScript 智能体使用与维护

活动实现为 agent/，Node.js 24 原生 ESM，无第三方运行依赖。Java/Spring Boot 通过受控 NDJSON 子进程调用 agent/bridge.mjs。旧 Python 交付仅在 [0.1.1 历史标签](https://github.com/Ceeyu-iooi/Semanote-Agent/tree/0.1.1) 保留，当前源码、工具和测试不需要 Python。

## 在网页使用

顶部「设置」→侧边「模型供应商」。左侧选择 DeepSeek、阿里云百炼或新增自定义 OpenAI 兼容供应商，右侧维护地址、模型、密钥及参数。状态只表示本机是否已配置密钥，不代表已连接或余额。保存后密钥不回显；留空保留，配置只写入被忽略的 profile/runtime/model-providers.json。

选择文本和任务后生成自动候选，成功层可检查并显式保存。失败不会自动重试、切换供应商或覆盖人工快照；显式重试保留成功层及旧尝试。中断后无法确认外部是否已计费，应先核对供应商记录。

## 独立调用

请求 JSON 含 requestId、revisionId、text 和 tasks，格式见 [标注契约](annotation-contract.md)。CLI 从同一供应商注册表读取配置，凭据不进入命令行。

~~~powershell
node agent/cli.mjs --input examples/annotation-request.json --output profile/result.json --provider aliyun --consent
node agent/cli.mjs --input examples/annotation-request.json --output profile/retry-result.json --previous profile/result.json --provider aliyun --consent
node examples/call-agent.mjs
~~~

--consent 表示调用者已获准把这份输入发送给所选服务；该参数本身不授予真实语料外发权限。仅本地 paragraphs 任务无需供应商或远程同意。输出已存在时拒绝覆盖。库入口为 annotate(request, config, {previousResponse, onProgress}) 和 manual(envelope)。

## 调度、缓存与成本

每个最多 650 码点的无损块将所选远程任务合并推理，段落由本地生成。有效成功层按供应商、地址、凭据摘要、模型、参数、提示词及文本隔离缓存。损坏缓存按未命中处理；词性重试携带已保留分词；跨块关键词合并排名。缓存命中不调用模型，返回新的候选身份。

自动情感、意图、语义必须覆盖全部非空白原文；实体支持按出现语境定位。格式、原文切片和依赖均由本地检查，仍需人工审阅语义。模型输出中的空白词项只视为排版，原文空格、CRLF 和 emoji 均保留。

日志只记录任务、供应商/模型声明、请求次数、耗时和实际 usage；缺失 token/缓存用量保持未知，不填零。页面筛选和图表只汇总已知值。不硬编码价格，不把 token 数当账单金额。

## 验证与恢复

~~~powershell
node --test agent/*.test.js frontend/tests/*.test.js tools/tests/*.test.mjs
node tools/evaluate-agent.mjs --replay --all
# 仅已获授权的原创合成样本，实际发送到本机已配置的百炼
node tools/evaluate-agent.mjs --remote --round 1 --run explicit-check
node tools/sync-workflow.mjs --check
node tools/verify-initialization.mjs --audit-data --expect-git
~~~

十组合成样本见 examples/evaluation-cases.json，回执与原始回包仅存 profile/verification/immersive。离线回放不算真实请求。CSV 没有金标准；结构通过、原文覆盖和缓存命中均不能外推为准确率或 F1。既有 DeepSeek 样本授权不扩展到百炼。

Archify 图可直接离线打开；重新生成见 [设计入口](design/README.md) 和 tools/generate-architecture.mjs。智能体本身无需安装依赖。恢复前检查 Git 状态，历史实现通过标签查看，不移动标签或硬重置。
