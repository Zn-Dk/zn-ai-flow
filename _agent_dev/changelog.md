# 变更日志

> 记录每次代码实施/修复/重构的根因分析与改动文件。
> 与 `DECISIONS.md` 的区别：DECISIONS 记录"为什么选方案 A"，本文件记录"具体改了什么、遇到了什么问题"。

---

## 快速索引

| 编号 | 类型 | 标题 |
| ---- | ---- | ---- |

> 暂无条目。Phase 4 开始实际编码（4.1 seed 脚本）后在此追加第一条。

---

## 正文

（暂无，编码开始后按 `### 实施 N: [标题]` 格式追加，包含：问题描述 / 根因分析 / 修改方案 / 修改文件表 / 核心代码片段）

---

## 历史决策与对话摘要

> 以下内容从原 `PROGRESS.md`（后正名为 `PLAN.md`）迁移而来，记录了 Phase 1~4 期间的重要决策和讨论结论，作为编码阶段的上下文溯源依据。

| 时间       | 主题                | 关键结论                                                                                                                                                                       |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 早期       | 选择学习版本        | 基于 miaoma-aiflow 完整版，输出学习路线文档                                                                                                                                    |
| 早期       | 工程化配置          | 复用 zn-lowcode 配置，适配扁平 apps 结构，创建所有根目录文件                                                                                                                   |
| 近期       | ESLint 问题         | react-hooks rules 应用对象展开而非数组展开（见 NOTES.md）                                                                                                                      |
| 近期       | Turbo 配置          | 分析了 Turbo 的作用，提供了完整 turbo.json 配置方案（见 DECISIONS.md）                                                                                                         |
| 2026-05-27 | 追踪记录            | 创建 \_agent_dev/ 并拆分为 CLAUDE / DECISIONS / PROGRESS / NOTES                                                                                                               |
| 2026-05-28 | Phase 2 规划        | 生成 phase/phase2-后端基础设施.md，含 9 步实施指南 + 踩坑点                                                                                                                    |
| 2026-05-31 | Phase 2 实施        | 完成 2.1~2.6；修正 Prisma 步骤顺序（schema→generate→PrismaModule）                                                                                                             |
| 2026-06-01 | Phase 2 完成        | 完成 2.7~2.9；解决 Prisma 7.8 ESM/CJS 冲突（需 CJS 模式 + 重新 generate）                                                                                                      |
| 2026-06-01 | Phase 3 规划        | 采用方案 B（独立 Phase 3/4/5/6），生成 phase3-AI工作流引擎.md 实施文档                                                                                                         |
| 2026-06-24 | PostgreSQL 补强决策 | ADR-011：暂停 Phase 3，优先实施 Phase 4 数据库 API；新建 `PostgreSQL-面试准备.md`                                                                                              |
| 2026-06-25 | Phase 3 进度核实    | 依代码核实，3.7 Start/End + 3.8 LLM + 3.9 HTTP 均已完成（共 336 行），此前误标为未开始；3.12 Logger 接口已定义无实现；`index.ts`/`node/index.ts` 为空未导出；实际暂停点为 3.10 |
| 2026-06-25 | Phase 4 文档编写    | 补齐 ADR-011 到 DECISIONS.md；Phase 3 文档 Condition→Intention 调整（代码已有 `intent`+`condition` 两种 NodeType，文档未同步）；编写 `phase/phase4-PostgreSQL补强.md` 实施文档（6 步骤，含 miaoma→NestJS 差异说明、事务修正踩坑） |
| 2026-07-03 | Phase4 范围合并（ADR-012） | 核实发现当前 Phase4（对应原miaoma Phase9）缺失鉴权核心内容（APIKey/Guard/执行接口），且4.2 App CRUD实际属于原Phase4；澄清"9.4外部执行接口"真实阻塞点是Phase3.11引擎主循环（非前端）；决策合并原Phase4+Phase9为当前Phase4范围，9.4做占位实现（Guard生效+AppExecution记录写入+结果标记ERROR，待3.11回补）；同步更新学习路线文档两处映射表、phase4文档新增4.7/4.8/4.9三节、修正4.1 seed脚本补充WorkflowExecution测试数据 |
| 2026-07-07 | `_agent_dev` 结构改造 | 对照 sdd-workflow skill 标准文件矩阵核查，发现即将进入Phase4编码阶段但缺 changelog.md（代码变更记录无处落地）、TODO.md（"鉴权待定"悬空在对话里）、CLAUDE.md角色错位（无MARK约束）；新建 changelog.md/TODO.md/会话级progress.md，CLAUDE.md补充5条MARK约束，.gitignore追加会话级文件排除规则 |
| 2026-07-09 | PROGRESS.md → PLAN.md 正名 | 发现 PROGRESS.md 与会话级 progress.md 大小写冲突（跨平台风险），且 PROGRESS 实际承担的是 skill 标准 PLAN.md 的职责（阶段划分+验收标准）。方案 B 执行：新建 PLAN.md（剥离对话历史表后的纯阶段规划）、对话历史迁移至本文件"历史决策与对话摘要"章节、删除 PROGRESS.md、更新 CLAUDE.md/DECISIONS.md 中的引用。 |
