# GitFlow 与版本迭代

目标远程：[Ceeyu-iooi/Semanote-Agent](https://github.com/Ceeyu-iooi/Semanote-Agent)，公开。初始化以 main 引导提交作为唯一例外，之后通过 PR 保留合并提交（merge commit），不用 squash/rebase 隐去分支合并关系。

| 分支 | 来源 | 合回 | 用途 |
|---|---|---|---|
| main | 初始化 | — | 已验证发布基线 |
| develop | main | — | 下一版本集成 |
| feature/<英文短名> | develop | develop | 一个可评审的阶段或功能 |
| release/<版本号> | develop | main，并同步 develop | 发布验证、文档和必要修复 |
| hotfix/<版本号> | main | main，并同步 develop；有活动 release 时也同步 | 已发布版本的紧急修复 |

## 常规工作

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feature/database-design
# 只暂存本阶段的明确文件，检查 git diff --cached
git add docs/database.md
git commit -m "docs(data): define database tables and relationships"
git push -u origin feature/database-design
```

随后创建目标 develop 的 PR，说明变动、验证和未决项，审阅后使用合并提交。此处命令示例不代表已执行 P01，也不代表该文件当前已存在。初始 main、develop 和初始化标签属于已交付基线，不计入五步开发；发布流程规则当前以文档约定落实，没有宣称 GitHub 分支保护或必需审批已配置。

发布时从 develop 建立 release/X.Y.Z，验证通过后 PR 合入 main，在 main 对应合并提交创建不可移动的带说明标签 vX.Y.Z，再将发布分支通过 PR 同步到 develop。紧急修复同理从 main 开始，完成后同步两个长期分支；存在活动 release 时同步其修复。合并完成后可删除已合并的临时远程分支。不得直接强推 main/develop、移动已发布标签或用硬重置丢弃用户改动。

## 版本规则

版本格式为 X.Y.Z，可带先行标识；Git 标签加 v。VERSION 保存不带 v 的当前版本，CHANGELOG 记录真实完成内容。对稳定版，兼容问题修复增加 Z，兼容功能增加 Y，不兼容的公开契约变化增加 X；增加高位时低位归零。公开契约包括接口、持久化兼容与 JSON 导出格式。

0.y.z 为初始开发阶段，不保证接口稳定；项目仍约定新增能力或破坏契约时增加 y，兼容修复增加 z，并在变更记录说明。纯文档修正通常随下一次发布，不为每次提交伪造新版本。alpha、beta、rc 仅在对应阶段实际达到时使用。

| 目标 | 成果 |
|---|---|
| v0.1.0-docs.1 | 本次初始化文档基线，无可运行业务软件 |
| v0.2.0 | 通过检查的原型与中期成果 |
| v0.3.0 | 四类基本标注、持久化、输入和展示闭环 |
| v0.4.0 | 人工校对与 JSON 导出 |
| v0.5.0 | 批量处理 |
| v1.0.0-rc.1 | 验收候选 |
| v1.0.0 | 满足课程与项目验收条件的正式交付 |

未来里程碑只写目标，不提前创建分支或标签。必要的补丁可插入，不为迎合表格跳过版本。发布标签必须指向对应验收内容。

## 首次公开提交与恢复

首次提交白名单为根目录说明/规范/配置、docs 的文本及离线流程、tools 的文档工具和 .github 的 PR 模板。不得 git add . 后假设忽略规则足够；使用明确路径并检查暂存文件与 diff。profile、真实语料、截图、最终课程报告和备份不属于白名单。个人真实报告经受限的课程渠道提交，不自动发送给任何人。

初始化标签是必要恢复基线，不额外复制仓库。需要查看旧基线时可先检查干净状态，再使用 `git switch --detach v0.1.0-docs.1`；回到工作分支用 `git switch develop`。存在未提交改动时先保护这些改动，不能直接 reset --hard。远程操作成功后核对 main、develop、标签及本地工作区状态。

参考：[原始 Git 分支模型](https://nvie.com/posts/a-successful-git-branching-model/)、[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。
