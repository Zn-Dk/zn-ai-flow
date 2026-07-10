# zn-ai-flow — Agent 开发追踪入口

> 本文件是 `_agent_dev/` 的入口索引，保持精简。详细内容见各子文件。

## 项目概述

| 项目         | 说明                                                |
| ------------ | --------------------------------------------------- |
| **名称**     | zn-ai-flow                                          |
| **定位**     | AI 工作流编排平台，个人学习实践项目                 |
| **参考项目** | `miaoma-aiflow`（完整版）                           |
| **目录**     | `/data/home/zndkqiu/learn/2026-Job/proj/zn-ai-flow` |

## 技术栈

| 层级         | 技术                                             |
| ------------ | ------------------------------------------------ |
| **Monorepo** | pnpm workspace + Turborepo                       |
| **前端**     | Next.js（apps/workflow、apps/webapp）            |
| **后端**     | NestJS（apps/api-server）                        |
| **共享包**   | packages/ai-engine（核心引擎库，tsup 编译）      |
| **数据库**   | PostgreSQL + Qdrant（向量数据库）                |
| **代码规范** | ESLint（纯 @stylistic，无 Prettier）+ TypeScript |
| **提交规范** | cz-git + commitlint（husky pre-commit 已注释）   |

## 规划目录结构

```
zn-ai-flow/
├── _agent_dev/          # Agent 追踪文件
├── apps/
│   ├── api-server/      # NestJS 后端
│   ├── workflow/        # Next.js 工作流前端
│   └── webapp/          # Next.js 外部调用演示
├── packages/
│   └── ai-engine/       # 核心引擎库
└── .dev/
    └── docker-compose.yaml
```

## ⚡ MARK 约束（每次迭代必看）

> 只记录用户明确发出的硬性规则，不记录 Agent 自行推导的规范。废弃标记状态但不删除。

### MARK #1: 增强类决策必须先/同步写入 DECISIONS.md

- 内容：相对 miaoma 参考实现的任何新增设计（增强项），必须先或同步记录到 `DECISIONS.md` 再进入实现，不能代码先行、文档后补
- 状态：生效（对应 ADR-008）

### MARK #2: 实现需对齐 phase 文档定义的设计与接口口径

- 内容：编码时优先按 `phase/phase*.md` 文档里定义的设计与接口实现，不擅自偏离；如需偏离，先改文档再改代码
- 状态：生效

### MARK #3: 代码和文档注释必须使用中文

- 内容：所有新增代码注释、文档内容统一用中文书写
- 状态：生效

### MARK #4: TS/JS/TSX/JSX 分区注释格式

- 内容：使用 VSCode `#region` / `#endregion` 格式做代码分区注释
- 状态：生效

### MARK #5: 方案不明确时必须先说明并等待确认

- 内容：修改或生成代码时如果存在多种可行方案，必须先向用户说明方案选项，等待确认后才能执行编辑操作，不能默认选一个就动手
- 状态：生效

---

## 子文件索引

| 文件                             | 职责                                       |
| -------------------------------- | ------------------------------------------ |
| [`PLAN.md`](./PLAN.md)             | 当前阶段进度 + 验收标准                      |
| [`TODO.md`](./TODO.md)           | 已知但暂不处理的问题                       |
| [`changelog.md`](./changelog.md) | 代码变更记录 + 历史决策与对话摘要            |
| [`DECISIONS.md`](./DECISIONS.md) | 架构/技术决策记录（ADR 格式）              |
| [`NOTES.md`](./NOTES.md)         | 踩坑记录 + 注意事项                        |
| `progress.md`                    | 会话级工作日志（Agent 工作记忆，已 gitignore）|
