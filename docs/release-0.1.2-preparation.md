# 0.1.2 发布准备

当前工作位于功能分支，版本仍为 0.1.1。0.1.2 是本轮拟发布目标，尚未合入主线、打标签或发布。

## 本地检查

- JavaScript 智能体、前端数据处理和工具：58 项测试通过。
- Java 后端：14 项测试通过；前端生产构建通过。
- 初始化和工作流文档一致性检查通过。
- 使用本地原创合成示例检查关键词词云：字号随出现次数变化，点击或聚焦显示次数，未出现右侧证据栏；支持减少动效。上述检查不代替用户验收。
- README 首页图已逐图查看，画面为合成示例；`assets/readme/dashboard.png` 的 SHA-256 为 `C59C63600DCA3791FB8DDA6E00CB23FF357214F36BC042E439DE6CBE971C48EB`。
- 本分支另两张 README 图片也已逐图查看：`workspace.png` 为 `D55A593C129558E3475AC269C1BDCDCBD855417C6ACDDB1A9A4724DEC127AC03`；`insights.png` 为 `950268D74F528BF53C5B3081D203737104D31839CDB42FA037F849ABA1A9E20A`。

## 发布前仍需完成

- 功能分支审阅并通过 PR 合入 develop，再从 develop 建立 release/0.1.2；完成发布复核后通过 PR 合入 main 并同步 develop。
- 复核窄屏与不同浏览器中的业务流程、图谱拖拽性能及远程模型实际缓存效果；本地并发复用测试不代表实测供应商命中率。
- 对实际发布提交更新版本信息和变更记录；只有完成发布后才创建 0.1.2 标签和发行记录。

开发依赖恢复：`npm ci --prefix frontend`。生产构建：`npm run build --prefix frontend`；收尾可用 `npm prune --omit=dev --prefix frontend` 保留运行依赖。
