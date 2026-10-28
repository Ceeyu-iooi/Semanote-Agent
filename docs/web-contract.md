# Web 系统实施与接口契约

日期：2026-10-28。用户已确认三组方案；本文件冻结 P04/P05 必要规则，模块契约仍为 1.0.0。

## 需求的准确表述

基于现有 Python 文本标注智能体，构建 Vue 3＋JavaScript＋Bootstrap 5 前端、Java 21＋Spring Boot 3.5 后端和 MySQL 8.4 存储的 B/S 软件。前端承担原文管理、交互标注、结果高亮和统计；后端承担导入校验、智能体调用、不可变修订/快照与恢复。实现“文本录入/导入 → 保存修订 → 自动候选或人工标注 → 显式保存快照 → 统计/JSON 导出”的单人工作流，多用户任务分配只保留扩展设计。

统一沿用 Apple DESIGN.md 与 preview 的视觉语言，维护离线设计 HTML、共享变量及开发者中心。开发者中心提供设计规范、整体/智能体/前端/后端/数据库 Archify 图、Changelog 和 GitFlow 可视化。新增规范登记来源、用途和兼容性，保持既有界面一致。

## 已确认约束

- Vue 3、Vite/npm、Bootstrap 5；Java 21、Spring Boot 3.5、Maven/JDBC；MySQL 8.4，结构脚本、SQL 备份/恢复；Windows 本地、当前 Chrome/Edge。Java 通过本地 JSON 子进程调用 Python；不改独立模块协议。
- UTF-8（允许 BOM）TXT/CSV。TXT 整文件一文本；CSV 首行三列列名，随后每格独立文本，重复不合并，保留来源逻辑记录号和列号/名。保留原文空格与换行，纯空白跳过并报告；不自动猜编码。
- 最多 10,000 Unicode 码点/文本、5 MiB/文件、500 个非空白文本/导入或批量操作；超过任何限制整次导入拒绝，不静默截断。原始课程 CSV 超过单批上限，须分批准备，不能把审计规模当容量承诺。
- 草稿只在当前页面保留；保存文本生成不可变修订，旧标注留历史，新修订当前快照清空。归档代替删除，可恢复；不承诺永久保留期限。
- 乐观并发 rowVersion；冲突 409，用户重新载入并保留本地草稿。自动推理只存候选，显式保存才更新当前快照；人工修正生成新快照，旧版不覆盖。
- Unicode 码点、0 起始左闭右开、UD 17 POS、五类 NER、重叠/重复/依赖按 annotation-contract.md；前后端均校验。
- 当前无登录，新安装默认监听 127.0.0.1；2026-10-28 用户后续明确授权局域网共享，可用本地配置开启网页监听及精确私网 Host/Origin 白名单，防火墙限定物理网卡、TCP 8080 与内网网段。MySQL 保持回环监听；访问者共享同一工作空间。远程模型发送需要逐次明确同意；受限真实语料仍不得外发。本次仅合成验证，不承诺公网多用户安全性。

## REST /api/v1

请求/响应字段 lowerCamelCase；JSON UTF-8。错误为 `{error:{code,message}}`，不返回堆栈、原文、密钥。400 非法输入、404 不存在、409 并发/版本冲突、413 容量超限、503 模型/队列暂不可用。

| 方法及路径 | 语义 |
|---|---|
| GET /health、/meta | 本地健康与标签/限制/供应商说明，不返回凭据 |
| GET/POST /documents | 完整本地文档列表；创建文本 |
| GET/PUT /documents/{id} | 当前详情；以 rowVersion 保存新修订/标题 |
| POST /documents/{id}/archive | rowVersion＋archived；归档或恢复 |
| GET /documents/{id}/revisions | 历史修订及相应快照 |
| POST /imports | multipart file；原子导入、来源和跳过数 |
| POST /jobs | documentId、revisionId、tasks、provider、requestId、remoteConsent；幂等提交自动标注，202 返回队列任务 |
| GET /jobs、/jobs/{id} | 持久任务及逐层结果；失败与零结果分开 |
| POST /jobs/{id}/retry | 显式恢复失败层；不自动重试，不覆盖成功层 |
| POST /documents/{id}/snapshots | rowVersion、revisionId、candidateId 或人工 layers、baseSnapshotId、allowPartial；新建并发布快照 |
| GET /documents/{id}/snapshots/{snapshotId} | 原文修订、快照与同一快照统计 |
| GET /documents/{id}/exports/{snapshotId} | 下载 JSON 1.0.0，固定快照/原文/来源/统计 |
| GET /statistics | 未归档文档当前修订的已保存快照统计，缺层数量明确 |

人工 layers 使用智能体已存在的候选表达：分词 itemText；关键词 itemText；POS tokenIndex/label；NER itemText/label/occurrence。服务经同一 Python 转换器生成可信位置/身份，不能接收客户端自报可信区间。未包含的层为未执行；合法空关键词/实体层为成功零结果。保存部分层必须 allowPartial=true。

## 存储与运行边界

物理结构由 backend/src/main/resources/schema.sql 定义，核心为文档、不可变文本修订、智能体任务/候选、快照、导入批次。19 个逻辑实体合并为版本化 JSON 聚合，不丢失条目、位置、尝试或来源身份。JSON 不是任意无校验数据：写入前按冻结契约转换/校验；当前不对单条标注做跨文档 SQL 检索。

所有写入使用事务；模型调用在事务外，任务先持久化再排队。重启将未完成任务标记 interrupted，用户显式恢复。过期修订的候选保留历史，不能发布到新修订。统计/导出从同一保存快照计算，不包含未保存草稿或候选。

多用户扩展需另行确认身份、角色、授权、任务归属、审计与并发；当前不伪造账户或分配能力。质量/性能阈值、真实语料外发、成员与正式课程日期仍分别受 D10/D09/D05/D12 约束。
