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

---

## ADR-005：API 响应格式设计（分离式）

- **状态**：已采纳
- **背景**：需要统一前后端的响应格式约定
- **决策**：成功和失败使用不同结构，而非传统的 `{ code, data, msg }` 统一包装
- **方案**：
  - 成功：`TransformInterceptor` 包装为 `{ success: true, data: T }`（HTTP 200）
  - 失败：`GlobalExceptionFilter` 输出 `{ code: HttpCode, message: string, details?: unknown }`（HTTP 4xx/5xx）
- **原因**：
  - 更类型安全（成功/失败是不同的 TypeScript 类型）
  - 符合 RESTful 语义（HTTP 状态码本身就区分了成功/失败）
  - 前端消费时逻辑更清晰（按 HTTP 状态码分流）
- **ErrorResponse 的 code 字段**：使用导出的枚举（`HttpCode`），而非 hardcode 字符串

---

## ADR-006：Prisma 集成步骤顺序

- **状态**：已采纳
- **背景**：Prisma 7 的 `PrismaClient` 是由 `prisma generate` 根据 `schema.prisma` 生成的代码，不是预装的 npm 包
- **决策**：严格按依赖链执行：schema → generate → PrismaModule
- **正确顺序**：
  1. 安装依赖 + 创建 `schema.prisma`（定义 Model）
  2. 执行 `prisma generate`（产出 `src/generated/prisma/` 下的 `PrismaClient`）
  3. 编写 `PrismaService extends PrismaClient`（此时才能 import）
- **原因**：如果先写 PrismaService 再 generate，TypeScript 编译会报错找不到 `PrismaClient`

---

## ADR-007：Phase 编号调整（方案 B — 独立阶段）

- **状态**：已采纳
- **背景**：原学习路线文档按 miaoma 完整版规划了 11 个 Phase（含用户认证、前端 CRUD 等）。实际实施中，我们优先后端引擎 + API，跳过认证和前端，导致原 Phase 3A/3B/3C 子阶段方案不够清晰
- **决策**：采用方案 B，将业务功能拆分为独立 Phase，而非子阶段
- **新编号**：
  - Phase 3 = AI 工作流引擎（`packages/ai-engine`）— 对应原规划 Phase 6
  - Phase 4 = 业务 API + 鉴权（`apps/api-server/modules`）— 对应原规划 Phase 9
  - Phase 5 = 知识库 RAG（可选）— 对应原规划 Phase 8
  - Phase 6+ = 前端编辑器 + 监控 — 对应原规划 Phase 5/7/10
- **原因**：
  - 每个 Phase 体量均匀（各 3-7 天），与 Phase 1/2 粒度一致
  - 每个 Phase 有独立的验证目标，完成感更强
  - Phase 5（知识库）是可选的，独立出来方便灵活跳过
  - PROGRESS.md 追踪简单，一目了然
