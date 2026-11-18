# 0.1.2 发布准备

本文记录 0.1.2 的发布前检查与验证范围。

## 本地检查

README 排版修订加入两张图片，已逐图核验。标注示例显示原创合成的读书会文本，SHA-256 为 `75B30E9B20FBB097270AB0FEA37F831D456EDD27A065D8F2F55ADAB67398882D`。Archify 系统图截图的 SHA-256 为 `DA7E0CEB797B6BE25D3532A2C65FEBC5A3CCA7FBC11BA33C8689FBC30477EDFA`。

- JavaScript 智能体、前端数据处理和工具：58 项测试通过。
- Java 后端：14 项测试通过；前端生产构建通过。
- 初始化和工作流文档一致性检查通过。
- 使用本地原创合成示例检查关键词词云：字号随出现次数变化，点击或聚焦显示次数，未出现右侧证据栏；支持减少动效。上述检查不代替用户验收。
- README 首页图已逐图查看，画面为合成示例；`assets/readme/dashboard.png` 的 SHA-256 为 `B183AAECBCC9241EF016BC2BDBE66CF152EC7A4AB48B78B9C740879C1BFEE80E`。
- 本分支另两张 README 图片也已逐图查看：`workspace.png` 为 `D55A593C129558E3475AC269C1BDCDCBD855417C6ACDDB1A9A4724DEC127AC03`；`insights.png` 为 `950268D74F528BF53C5B3081D203737104D31839CDB42FA037F849ABA1A9E20A`。

## 验证范围与发布流程

- 复核窄屏与不同浏览器中的业务流程、图谱拖拽性能及远程模型实际缓存效果；本地并发复用测试不代表实测供应商命中率。

开发依赖恢复：`npm ci --prefix frontend`。生产构建：`npm run build --prefix frontend`；收尾可用 `npm prune --omit=dev --prefix frontend` 保留运行依赖。
