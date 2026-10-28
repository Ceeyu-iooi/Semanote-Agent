# 独立智能体运行与恢复

适用 Python 3.12；本机实际版本为 3.12.5。请从项目根目录运行。P03 不需要安装 Python 包、NLP 模型、Java、数据库或网页依赖；没有需要裁剪的 node_modules，也没有第三方 Python 锁文件。

## 1. 配置

首次将 `.env.example` 复制为同目录 `.env`，填入自己的 `DEEPSEEK_API_KEY`；已有 `.env` 时直接编辑，不能覆盖现有凭据。密钥不放命令行参数或 Git。当前会话提供的密钥已仅写入本地 `.env`，公开示例仍为占位值。

```powershell
python -X utf8 -B -m semanote_agent check-config
```

该命令只检查本地配置并显示供应商、模型、超时和 token 上限，不验证远程余额/权限，不显示密钥。环境变量优先于 `.env`；文件使用 UTF-8 `KEY=value`，允许整行注释与成对引号，不支持变量替换、shell 命令或同名键重复。

DeepSeek 默认 `https://api.deepseek.com`、`deepseek-flash`、非思考 JSON 模式；模型名是可变化的供应商别名，结果记录请求模型和响应声明，不能承诺外部模型长期完全复现。参数依据 [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) 和 [JSON 模式](https://api-docs.deepseek.com/guides/json_mode/)。JSON 模式仍需要本地内容校验。

## 2. 单篇、程序调用与显式恢复

```powershell
# 发送原创合成示例；使用 API 配额。默认结果到 stdout，进度到 stderr。
python -X utf8 -B -m semanote_agent annotate --input examples/annotation-request.json

# output 的父目录须已存在；下列新文件名不能已被使用。
python -X utf8 -B -m semanote_agent annotate --input examples/annotation-request.json --output profile/result.json

# 对同一请求/修订，仅重试失败层，保存为另一个新文件。
python -X utf8 -B -m semanote_agent annotate --input examples/annotation-request.json --retry-from profile/result.json --output profile/retry-result.json

# 独立 Python 调用示例，同样会使用 API 配额。
python -X utf8 -B -m examples.call_agent
```

任务可在输入 JSON 的 `tasks` 中分别选择 `segmentation`、`keywords`、`pos`、`ner`；POS 的分词依赖会出现在 `effectiveTasks` 及结果中。stdin 可用 `--input -`，`--quiet` 关闭进度。退出码：0 为全部有效层成功，2 为输入/配置/文件错误，3 为部分或全部标注失败；失败响应文件仍可用于显式恢复。PowerShell 宿主可能把原生命令的非零退出概括为 1，应同时检查 `$LASTEXITCODE` 和结果状态。

请求格式及逐层含义见[契约](annotation-contract.md)。原文变化必须使用新的修订；旧响应不能用来重试新文本。超时不自动重发，也不自动换供应商。`retryable` 只是建议，验证失败仍可在核对原因后显式重试；不要把已有失败结果改成成功来跳过检查。

## 3. 其他供应商

在本地 `.env` 配置 `COMPATIBLE_BASE_URL`、`COMPATIBLE_MODEL`、`COMPATIBLE_API_KEY`，然后明确选择：

```powershell
python -X utf8 -B -m semanote_agent check-config --provider compatible
python -X utf8 -B -m semanote_agent annotate --provider compatible --input examples/annotation-request.json
```

Base URL 为服务的 HTTPS 基础路径，不含 `/chat/completions`，也不含用户凭据、查询参数或片段。仅当模型支持时将 `COMPATIBLE_JSON_MODE=true`；否则设 false，提示仍要求 JSON，本地仍严格解析。供应商特殊参数通过 `COMPATIBLE_EXTRA_BODY` JSON 对象提供，不能覆盖 model/messages/stream/response_format/max_tokens/temperature。

任意供应商名如 `qwen` 使用独立 `QWEN_BASE_URL`、`QWEN_MODEL`、`QWEN_API_KEY`、`QWEN_JSON_MODE` 和 `QWEN_EXTRA_BODY`；必须根据该供应商官方资料填写实际端点/能力，不把示例当远程验证通过。不同协议的服务需按设计说明实现新适配器。未授权真实数据不得因为切换成功就外发。

## 4. 验证和 Archify 重建

```powershell
python -X utf8 -B -m unittest discover -s tests -v
python -X utf8 -O -B -m unittest discover -s tests -q
python -X utf8 -B tools/sync_workflow.py --check
python -X utf8 -B tools/verify_initialization.py --audit-data --expect-git
```

测试替身不消耗 API、不代表真实 NLP 质量；临时文件只在项目内 `tmp` 的独立目录生成并移除。真实验证回执在本地 `profile/verification/agent`，仅含原创合成内容及结果。

Archify 生成品可直接离线浏览，无需安装工具。重建需 Node ≥18（本机 24.16.0）及本地 Archify 包；从官方仓库取得 `archify` 子目录到 `profile/tools/archify`，保留许可，不安装开发依赖。本次工具来源与摘要见本地 `profile/tools/archify/source.json`。

```powershell
$env:ARCHIFY_UPDATE_CHECK_DISABLED = '1'
node profile/tools/archify/bin/archify.mjs finalize architecture docs/diagrams/agent-architecture.json docs/diagrams/agent-architecture.html --quality showcase --out-dir profile/verification/archify/rebuild --json
```

输入或已验证 HTML 发生变化后，新的 `--out-dir` 应尚未使用，以保留证据归属；不能删掉未知锁或回执强行重建。第三方许可在 `docs/diagrams/licenses`；它们适用于 Archify 生成器/Viewer，不是给本项目授予整体开源许可。

## 5. 收尾与恢复

保留源码、测试、合成示例、正式文档、最新架构图/源文件、第三方许可、本地配置与核查资料。无新增运行依赖，恢复开发直接使用 Python 3.12 和源码，无须安装或恢复环境。初始化标签仍是必要 Git 基线，P03 另由中文说明的 feature 提交保留，不复制整份仓库备份。

恢复前先看 `git status` 和用户新改动，再通过 Git 历史查看目标文件；不执行 `reset --hard`。当前交付不启动 P04。
