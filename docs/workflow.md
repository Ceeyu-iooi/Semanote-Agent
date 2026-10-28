<!-- Generated from workflow.json; SHA-256: 4ec16f0a62d13278805c28056fac85edfb5f742e8a03f7f890a0375f2bed93d3. Do not edit this generated file. -->

# 五步开发流程

保持数据库设计 → 需求文档 → 智能体 → 后端 → 前端五步。2026-10-28 用户已授权 P04/P05，后端验证后联调前端；本地交付不自动代表用户验收。

唯一编辑源为 workflow.json。初始化已交付；当前状态：P01 用户已验收；P02 用户已验收；P03 用户已验收；P04 执行中；P05 执行中。浏览或复制不会执行开发或改变验收状态。技术选型等未决项保持 TBD，分别在相关步骤实现前确认。

测试、统计、人工校对、导出、批量和课程交付检查点纳入相应步骤，不额外拆分主流程。

[离线交互流程](workflow.html) · [五份完整提示词](prompts.md) · [待决策清单](decisions.md)

## 五步开发流程

数据库设计 → 需求文档 → 智能体开发 → 后端开发 → 开发前端

| 阶段 | 依赖 | 状态 | 产物 |
|---|---|---|---|
| [P01 设计数据库](prompts.md#p01) | — | 用户已验收 | docs/database.md：表、字段、关系、约束与生命周期设计；待确认的数据设计问题 |
| [P02 写需求文档](prompts.md#p02) | P01 | 用户已验收 | docs/PRD.md：功能、页面、流程、异常与验收条件；与 PRD 对齐的 docs/database.md、待决策清单 |
| [P03 智能体开发](prompts.md#p03) | P02 | 用户已验收 | 智能体模块及独立调用示例；标注输入输出契约、标签/区间与工具映射说明；四类能力及异常场景的真实验证记录 |
| [P04 后端开发](prompts.md#p04) | P03 | 执行中 | 后端项目、适用存储与智能体集成；docs/api-contract.md 和接口调用/测试资料；启动配置、备份恢复与真实接口验证记录 |
| [P05 开发前端](prompts.md#p05) | P04 | 执行中 | 前端项目、真实后端联调及完整标注工作流；界面、接口、Unicode、异常、响应式与键盘验证记录；操作/运行说明、课程材料核对及收尾报告 |

## 参考与表达

- [参考博客：全栈应用开发流程](https://ai80.net/vibe-coding-practice/04%20Vibe%20Coding%20%E5%85%A8%E6%A0%88%E5%BA%94%E7%94%A8%E5%BC%80%E5%8F%91)
- [VibeHub：PRD](https://vibe-hub.org/prd)
- [VibeHub：验收标准](https://vibe-hub.org/acceptance-criteria)
- [VibeHub：人在回路](https://vibe-hub.org/human-in-the-loop)
