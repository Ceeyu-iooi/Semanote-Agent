# Spring Boot 后端与 MySQL

先读根 AGENTS.md、docs/web-contract.md、docs/database.md、docs/annotation-contract.md。

- Java 21、Spring Boot 3.5、Maven、JDBC、MySQL 8.4；以 stdin/stdout JSON 通过本地进程调用Node.js/JavaScript 智能体，不拼 shell，不把原文或密钥放命令行。
- controller 处理 HTTP，service 处理业务与版本，repository 执行参数化 SQL，agent 适配进程/契约。事务明确，乐观冲突返回 409；模型调用期间不持有数据库行锁。
- 修订/结果不可变，快照绑定修订和有效结果。重推理只新增候选，显式保存才切换快照；人工/自动版不相互覆盖。POS 引用确定分词结果。
- 服务端校验容量、导入、标签、依赖、码点、重复和覆盖；不信任前端。来源行列保留、不裁剪原文，超限明确拒绝。
- 新安装默认只监听回环；用户已明确授权此工作空间开放局域网，可通过本地配置启用网页 LAN 监听、精确的本机私网 Host/Origin 白名单和网段/端口防火墙规则。MySQL 仍只监听回环；不关闭 Host/Origin 校验，不开放公网或宣称拥有多用户权限体系。诊断不返回密钥、私有路径或模型原始错误，真实语料外发仍受根规范约束。
- 维护迁移、SQL 备份和恢复说明；真实库/备份放 profile。测试用隔离数据库，不操作正式数据。

- 0.1.1 供应商注册表与密钥只存 profile，GET 只返回 hasApiKey；地址变更需重填密钥。任务入队时在内存固定完整配置，密钥不得进入 requestJson。模型日志只读脱敏元数据，不含原文。
