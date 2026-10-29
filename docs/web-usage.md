# Web 系统运行、备份与开发恢复

Windows 本地 Java 21、Node.js 24、Python 3.12；Node 负责活动智能体，Python 负责维护工具。默认 [本地工作台](http://127.0.0.1:8080)，MySQL 为 127.0.0.1:3307。当前无登录，不应直接公网开放；本地构建不自动提升发布版本。

<a id="局域网访问"></a>
## 局域网访问

2026-10-28 用户已授权本工作空间开放局域网。启用后，同网段设备访问启动工具显示的 `http://本机内网IP:8080`，共享同一文本库、标注、模型配置和操作能力；这不会创建多用户账户或权限体系。原始语料外发限制继续有效。

```powershell
python -X utf8 -B tools/local_web.py lan
# 管理员 PowerShell 7 中执行；仅新增/更新本项目的网段和端口规则。
& .\tools\configure_lan.ps1
```

模式保存在忽略的 profile/runtime/local-config.json，后续 start 沿用。网页监听所有 IPv4 接口，但仅接受本机回环及已配置物理网卡私网 IP 的 Host/Origin；防火墙限定 Java 程序、当前物理网卡/地址、其内网网段、TCP 8080，不修改网络类别或其他防火墙规则。MySQL 始终监听 127.0.0.1:3307。

关闭共享：`python -X utf8 -B tools/local_web.py local`；管理员 PowerShell 7 执行 `& .\tools\configure_lan.ps1 -Disable` 可停用项目规则。换 Wi-Fi 或内网 IP 改变后，重新运行 lan 和规则配置。服务/本机内网地址检查通过不等同于已从另一台设备验证；若网络启用了设备隔离，需要使用允许设备互访的网络。

局域网 HTTP 页面中自动标注与失败层重试使用 Web Crypto 生成请求 UUID，兼容不提供 crypto.randomUUID 的浏览器上下文。

## 启动与操作

在项目根目录运行：

```powershell
python -X utf8 -B tools/local_web.py start
```

工具只管理本项目进程，复用 profile/tools 便携 MySQL；初次创建 profile/runtime/mysql-data、随机密码和本地配置，不接管系统数据库。配置/数据被忽略，不公开。中文路径使用 MySQL Windows 兼容选项文件编码；业务文本仍严格 UTF-8。

1. 文本库新建或导入 DOCX、UTF-8 TXT/MD/三列 CSV；TXT/MD/DOCX 各为整份正文，CSV 每格独立并保留来源行列和重复。10000 码点/文本、5 MiB/文件、500 非空文本/批；超限整次拒绝，纯空白跳过并报告。DOCX 只提取正文，不读取外链或宏。
2. 在工作台自动标注或直接人工标注。模型会发送文本，须确认有权外发；本轮百炼仅测试原创合成文本；其他真实语料仍按服务和范围授权。在左下角设置中维护供应商、HTTPS 地址、模型和密钥，详见 agent-usage.md；不伪造结果或自动切换。
3. 自动结果先存候选，显式保存才成为当前快照。人工可划选添加实体/关键词、改标签/移除；分词每行一词，应用后清除不兼容 POS；POS 按词项填写。
4. 草稿仅当前页面保留，失败不清空；冲突后载入最新版本并保留草稿，原文改变时重新核对。历史快照只读；编辑原文生成新修订，旧区间只留历史。
5. 统计和 JSON 导出使用同一已保存快照；不包含草稿或候选。缺层不同于成功零条目，保存部分层需明确勾选。
6. 文本库多选后可批量标注，每份独立任务/结果/重试，失败不清除其他成功项；任务持久化，刷新可找回。当前无多用户分配。
7. 开发者中心在独立 /developer 页面维护设计 preview、系统/智能体/前后端/数据库 Archify、实际 Git 时间轴/提交差异、Changelog 和 GitFlow 规范。新增规范按 design/README.md 同步实际组件及 preview。

本地 profile/data/train.csv 存在时，启动按精确原文幂等加入 1,607 份初始语料，保留全部 15,306 处来源，不覆盖用户已有修订/标注。列表分页、来源筛选与全文搜索可直接选用；隔离测试设置 SEMANOTE_SEED_CORPUS=false。原始 CSV 不修改，不随公开仓库分发。

工作台的十一层显示可以独立叠加；点击词项查看对应条目，人工模式可划选增加实体/关键词，或修改分词与 POS。字体、字号、行距在正文工具条调整；左下角设置配置阅读和默认模型，密钥只存本机受忽略的供应商注册表。候选保存后可导出同一快照的 JSON、TXT 或 Markdown。逐词显现是已返回结果的呈现动画，推理状态以实际图层回执为准。

完整返回的部分失败候选可显式重试失败层，保留成功层与旧尝试。服务中断/超时/输出不完整时，无法证明哪些外部调用已完成，显式重提可能重新调用全部层并额外计费，应先核对供应商记录；不会自动重发。

## 构建和开发依赖恢复

Windows 重建前先停止本项目后端：`python -X utf8 -B tools/local_web.py stop`，避免运行中的 JAR 被锁定；构建通过后重新 start。

浏览器所需 Vue/Bootstrap 已编译进 frontend/dist，网页部署不需要 frontend/node_modules；活动智能体仍需要 Node.js 24。确认成品可运行后，可以清除本次 npm 环境，开发时由锁文件恢复：

```powershell
python -X utf8 -B tools/local_web.py stop
python -X utf8 -B tools/download_web_tools.py
python -X utf8 -B tools/build_web.py
python -X utf8 -B tools/local_web.py start
```

build_web.py 缺 Vite 时执行 npm ci，再构建、同步开发者资料、Maven 编译和测试。JAVA_HOME 需指向 Java 21；不全局改环境/安装系统服务。下载校验官方摘要：Maven SHA-512、MySQL 厂商 MD5 完整性值及 HTTPS 来源。依赖锁定于 pom.xml/package-lock.json，第三方许可见 docs/licenses。

开发前端可在 frontend 执行 npm ci、npm run dev，Vite 只绑定回环并代理 /api；正式运行使用 8080 同源资源。REST 与人工候选格式见 web-contract.md，智能体仍可独立调用。

## SQL 备份与恢复

```powershell
python -X utf8 -B tools/local_web.py backup
```

唯一新 SQL 位于 profile/backups，包含结构和数据。备份是敏感资料，只通过受限课程渠道传递。恢复前先停写、核对身份/目标和新数据，恢复到新空库验证，不覆盖当前库；不能把备份复制进公开仓库。

mysql 从 profile/runtime/mysql-client.cnf 读取凭据，密码不放命令行。使用 Python 把备份原始字节送入客户端，避免 PowerShell 管道重编码；示意（NEW_EMPTY_DATABASE 必须先创建并核实为空）：

```python
from pathlib import Path
import subprocess
subprocess.run([
    'profile/tools/mysql/bin/mysql.exe',
    '--defaults-file=profile/runtime/mysql-client.cnf',
    '--default-character-set=utf8mb4', 'NEW_EMPTY_DATABASE'
], input=Path('profile/backups/CHOSEN_BACKUP.sql').read_bytes(), check=True)
```

隔离备份/恢复验证见 tools/verify_web.py。自定义数据库通过 SEMANOTE_DB_URL/USER/PASSWORD、项目根目录与 Python 路径通过 SEMANOTE_PROJECT_ROOT/PYTHON 配置后直接 java -jar 启动；local_web.py 只管理默认本地库，不接管其他实例。

## 检查与保留

统计是条目数量，不是准确率/F1；尚无金标准或质量/性能阈值验收。保留源码、锁、许可、frontend/dist、最新 Spring JAR、本地 MySQL 运行组件/库/配置、正式资料和最终回执。仅清理本次已知临时测试库、中间文件和 npm 构建环境，不删原件、用户数据、外部日志或全局缓存。初始化 Git 标签仍为恢复基线；先看 git status，不硬重置或复制整仓。
