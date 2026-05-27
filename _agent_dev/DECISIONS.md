# DECISIONS — 架构与技术决策记录

> ADR（Architecture Decision Record）格式，记录**为什么这样做**。只追加，不修改已采纳的决策。

---

## ADR-001：选择 miaoma-aiflow 完整版作为参考

- **状态**：已采纳
- **背景**：有 demo 版、完整版、v2 插件版三个版本可选
- **决策**：选择完整版（`miaoma-aiflow`）
- **原因**：
  - demo 版逻辑不完整，缺少核心业务
  - v2 插件版增加了插件市场的打包发布和接入，复杂度过高，不适合初学
  - 完整版包含完整业务逻辑，是最佳学习参考

---

## ADR-002：工程化配置方案

- **状态**：已采纳
- **背景**：需要搭建 monorepo 工程化基础
- **决策**：复用 `zn-lowcode` 的根目录配置，适配扁平 apps 结构
- **关键差异**：
  - `pnpm-workspace.yaml`：`apps/*` 扁平结构（vs zn-lowcode 的 `apps/frontend/*` + `apps/backend/*`）
  - `eslint.config.ts`：前端匹配 `apps/workflow/**` + `apps/webapp/**`，后端匹配 `apps/api-server/**`
  - `commitlint.config.js`：直接扫描 `apps`，不分子目录
- **ESLint 方案**：纯 `@stylistic/eslint-plugin` 格式化，不引入 Prettier，避免规则冲突

---

## ADR-003：引入 Turborepo 管理任务编排

- **状态**：已采纳，待执行
- **背景**：monorepo 中 `packages/ai-engine` 需要先 build，`apps/workflow` 才能引用其产物
- **决策**：在根目录安装 `turbo`，添加 `turbo.json`
- **原因**：
  - Turbo 的 `"dependsOn": ["^build"]` 自动处理包间拓扑顺序
  - 提供并行任务执行和缓存能力
- **注意**：Turborepo ≠ Turbopack
  - Turborepo：monorepo 任务调度器（本项目使用）
  - Turbopack：Next.js 内置的打包工具（Next.js 自动使用，无需额外配置）
- **turbo.json 配置方案**：
  ```json
  {
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
      "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
      "dev": { "cache": false, "persistent": true },
      "lint": { "dependsOn": ["^build"] },
      "clean": { "cache": false }
    }
  }
  ```

---

## ADR-004：\_agent_dev 追踪文件拆分

- **状态**：已采纳
- **背景**：CLAUDE.md 内容过多，每次对话需读取大量无关内容
- **决策**：按职责单一原则拆分为 4 个文件
- **文件职责**：
  - `CLAUDE.md`：入口索引，精简 < 50 行
  - `DECISIONS.md`：架构/技术决策（本文件）
  - `PROGRESS.md`：阶段进度 + 待办 + 对话摘要
  - `NOTES.md`：踩坑记录（积累到 3 条以上再创建）
