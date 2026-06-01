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

## 子文件索引

| 文件                             | 职责                          |
| -------------------------------- | ----------------------------- |
| [`PROGRESS.md`](./PROGRESS.md)   | 当前阶段进度 + 待办事项       |
| [`DECISIONS.md`](./DECISIONS.md) | 架构/技术决策记录（ADR 格式） |
| [`NOTES.md`](./NOTES.md)         | 踩坑记录 + 注意事项           |
