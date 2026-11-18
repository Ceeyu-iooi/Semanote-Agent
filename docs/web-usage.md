# Web 系统运行、备份与开发恢复

Windows 本地 Java 21、Node.js 24；Node 负责智能体及全部构建、启动与维护工具。默认 [本地工作台](http://127.0.0.1:8080)，MySQL 为 127.0.0.1:3307。当前无登录，不应直接公网开放；本地构建不自动提升发布版本。

<a id="局域网访问"></a>
## 局域网访问

2026-10-28 用户已授权本工作空间开放局域网。启用后，同网段设备访问启动工具显示的 `http://本机内网IP:8080`，共享同一文本库、标注、模型配置和操作能力；这不会创建多用户账户或权限体系。原始语料外发限制继续有效。

```powershell
node tools/local-web.mjs lan
# 管理员 PowerShell 7 中执行；仅新增/更新本项目的网段和端口规则。
& .\tools\configure_lan.ps1
```

模式保存在忽略的 profile/runtime/local-config.json，后续 start 沿用。网页监听所有 IPv4 接口，但仅接受本机回环及已配置物理网卡私网 IP 的 Host/Origin；防火墙限定 Java 程序、当前物理网卡/地址、其内网网段、TCP 8080，不修改网络类别或其他防火墙规则。MySQL 始终监听 127.0.0.1:3307。

关闭共享：`node tools/local-web.mjs local`；管理员 PowerShell 7 执行 `& .\tools\configure_lan.ps1 -Disable` 可停用项目规则。换 Wi-Fi 或内网 IP 改变后，重新运行 lan 和规则配置。服务/本机内网地址检查通过不等同于已从另一台设备验证；若网络启用了设备隔离，需要使用允许设备互访的网络。

局域网 HTTP 页面中自动标注与失败层重试使用 Web Crypto 生成请求 UUID，兼容不提供 crypto.randomUUID 的浏览器上下文。

## 启动与操作

在项目根目录运行：

```powershell
node tools/local-web.mjs start
```

工具只管理本项目进程，复用 profile/tools 便携 MySQL；初次创建 profile/runtime/mysql-data、随机密码和本地配置，不接管系统数据库。配置/数据被忽略，不公开。项目路径含非 ASCII 字符时，MySQL 启动器自动分配并校验一个项目专用临时盘符，以兼容 Windows 路径；数据库仍位于原目录，业务文本严格 UTF-8。盘符会在数据库运行期间保留，不覆盖已有盘符。

`node tools/local-web.mjs stop` 停止后端并保留数据库；要同时关闭由本工具通过临时盘符启动的数据库并释放盘符，随后运行 `node tools/local-web.mjs stop-database`。该命令核验监听进程和盘符归属，后端仍运行或归属无法确认时拒绝操作。它不会关闭由其他程序管理的数据库。

1. 在文本库选择或拖放 DOCX、UTF-8 TXT、Markdown 和三列 CSV，可一次选择多个文件。TXT、MD 和 DOCX 按文件导入，CSV 按非空单元格导入并保留来源行列和重复项。单文本最多 10,000 码点，CSV 每文件最多 64 MiB 和 50,000 份非空文本，其余文件最多 5 MiB。每个文件单独提交，空白和失败情况会报告。
2. 在工作台自动标注或直接人工标注。模型会发送文本，须确认有权外发；本轮百炼仅测试原创合成文本；其他真实语料仍按服务和范围授权。在顶部设置中维护供应商、HTTPS 地址、模型和密钥，详见 agent-usage.md；不伪造结果或自动切换。
3. 自动结果先存候选，显式保存才成为当前快照。人工可划选添加实体/关键词、改标签/移除；分词每行一词，应用后清除不兼容 POS；POS 按词项填写。
4. 草稿仅当前页面保留，失败不清空；冲突后载入最新版本并保留草稿，原文改变时重新核对。历史快照只读；编辑原文生成新修订，旧区间只留历史。
5. 统计和 JSON 导出使用同一已保存快照；不包含草稿或候选。缺层不同于成功零条目，保存部分层需明确勾选。
6. 文本库多选后可批量标注，每份独立任务/结果/重试，失败不清除其他成功项；任务持久化，刷新可找回。当前无多用户分配。
7. 开发者中心在独立 /developer 页面维护设计 preview、系统/智能体/前后端/数据库 Archify、实际 Git 时间轴/提交差异、Changelog 和 GitFlow 规范。新增规范按 design/README.md 同步实际组件及 preview。

本地 profile/data/train.csv 存在时，启动按精确原文幂等加入 1,607 份初始语料，保留全部 15,306 处来源，不覆盖用户已有修订/标注。列表分页、来源筛选与全文搜索可直接选用；隔离测试设置 SEMANOTE_SEED_CORPUS=false。原始 CSV 不修改，不随公开仓库分发。

工作台的十一层显示可以独立叠加；点击词项查看对应条目，人工模式可划选增加实体/关键词，或修改分词与 POS。字体、字号、行距在正文工具条调整；顶部设置配置阅读和默认模型，密钥只存本机受忽略的供应商注册表。候选保存后可导出同一快照的 JSON、TXT 或 Markdown。逐词显现是已返回结果的呈现动画，推理状态以实际图层回执为准。

完整返回的部分失败候选可显式重试失败层，保留成功层与旧尝试。服务中断/超时/输出不完整时，无法证明哪些外部调用已完成，显式重提可能重新调用全部层并额外计费，应先核对供应商记录；不会自动重发。

## 构建和开发依赖恢复

Windows 重建前先停止本项目后端：`node tools/local-web.mjs stop`，避免运行中的 JAR 被锁定；构建通过后重新 start。

浏览器所需 Vue/Bootstrap 已编译进 frontend/dist，网页部署不需要 frontend/node_modules；活动智能体仍需要 Node.js 24。确认成品可运行后，可以清除本次 npm 环境，开发时由锁文件恢复：

```powershell
# 停止旧后端，释放正在运行的 JAR
node tools/local-web.mjs stop
# 下载并校验项目工具，复用已有安装
node tools/download-web-tools.mjs
# 恢复构建依赖并生成前后端成品
node tools/build-web.mjs
# 启动本机数据库和新版 Web 服务
node tools/local-web.mjs start
```

`JAVA_HOME` 指向 Java 21。下载与构建默认使用华为云的 Maven 和 npm 镜像，加入 `--source=official` 可选择官方源。构建使用项目内配置，依赖版本见 `pom.xml` 和 `package-lock.json`。

Maven 安装包按 Apache 发布的 SHA-512 校验。MySQL 8.4.13 从官方 CDN 获取约 25 MiB 的压缩数据，按项目清单逐文件校验 SHA-256，安装后的运行文件约 81 MiB。清单固定了官方 ZIP 中所需文件的字节范围。已有的便携 MySQL 继续使用，许可证随运行文件保留。如果网络代理拒绝返回字节范围，下载命令会报错，仍可复用已验证的便携安装。

开发前端可在 frontend 执行 npm ci、npm run dev，Vite 只绑定回环并代理 /api；正式运行使用 8080 同源资源。REST 与人工候选格式见 web-contract.md，智能体仍可独立调用。

## SQL 备份与恢复

```powershell
node tools/local-web.mjs backup
```

唯一新 SQL 位于 profile/backups，包含结构和数据。备份是敏感资料，只通过受限课程渠道传递。恢复前先停写、核对身份/目标和新数据，恢复到新空库验证，不覆盖当前库；不能把备份复制进公开仓库。

mysql 从 profile/runtime/mysql-client.cnf 读取凭据，密码不放命令行。使用客户端的 `source` 命令读取 SQL 文件，先创建并核实恢复目标为空库：

```powershell
# 恢复仅面向已核实的新空库；先检查备份与目标，保留当前库。
profile/tools/mysql/bin/mysql.exe --defaults-file=profile/runtime/mysql-client.cnf --database=your_verified_empty_database --execute="source profile/backups/your-verified-backup.sql"
```

隔离备份/恢复验证见 tools/verify-web.mjs。自定义数据库通过 SEMANOTE_DB_URL/USER/PASSWORD、项目根目录与 Node 路径通过 SEMANOTE_PROJECT_ROOT/NODE 配置后直接 java -jar 启动；local-web.mjs 只管理默认本地库，不接管其他实例。

## 检查与保留

统计是条目数量，不是准确率/F1；尚无金标准或质量/性能阈值验收。保留源码、锁、许可、frontend/dist、最新 Spring JAR、本地 MySQL 运行组件/库/配置、正式资料和最终回执。仅清理本次已知临时测试库、中间文件和 npm 构建环境，不删原件、用户数据、外部日志或全局缓存。初始化 Git 标签仍为恢复基线；先看 git status，不硬重置或复制整仓。

### 显式离线构建

已有核实的本地可执行 JAR 时，可用 `node tools/build-web.mjs --offline-from backend/target/semanote-web-0.1.2.jar` 复用 JAR 中已验证的 Java 依赖。离线重建前端需要提前安装 npm 依赖。接口回归可独立运行 `node tools/verify-web.mjs`。
