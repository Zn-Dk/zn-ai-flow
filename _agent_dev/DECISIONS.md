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
  - `PLAN.md`：阶段进度 + 验收标准
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
  - PLAN.md 追踪简单，一目了然

---

## ADR-008：允许增强，但必须先记录到决策文件

- **状态**：已采纳
- **背景**：在对齐 `miaoma-aiflow` 学习路径时，允许做工程化增强（例如可观测性、状态管理增强），但如果不留痕会导致后续实现口径不一致
- **决策**：允许增强；凡是相对参考实现的新增设计，必须先（或同步）记录到 `_agent_dev/DECISIONS.md`，再进入实现
- **执行约束**：
  - 增强项需说明：增强点、收益、影响范围、回退策略
  - 若增强会引入额外类型/流程（如 `NodeStatus`），后续源码必须全链路体现，禁止半落地
  - 若无法完整落地，应回退为“贴近参考实现”的最小方案
- **原因**：
  - 保证学习路径与实现结果可追溯
  - 避免“文档允许增强、代码却半实现”的漂移
  - 便于后续 CR 和阶段复盘统一判断标准

---

## ADR-009：ExecutionContext 采用“接口优先 + 默认实现”

- **状态**：已采纳
- **背景**：Phase 3.4 原文档以 `ExecutionContext` 类作为直接契约，后续在 `VariableResolver`、`NodeExecutor`、`Engine` 示例中也直接依赖具体类。随着上下文能力演进（如替换存储实现、测试替身、跨模块解耦），直接依赖具体类会增加耦合。
- **决策**：在 `core/context.ts` 中先定义 `IExecutionContext` 作为运行态契约，再提供 `DefaultExecutionContext` 作为默认实现；跨模块类型签名优先依赖 `IExecutionContext`。
- **执行约束**：
  - 3.4 章节代码示例采用 `IExecutionContext + DefaultExecutionContext` 形态
  - 3.5/3.6/3.11 中涉及上下文参数的签名统一使用 `IExecutionContext`
  - 仅在实例化处使用 `new DefaultExecutionContext(inputs)`，避免对具体实现的扩散依赖
  - 保留最小实现原则，不引入额外上下文实现类（按需再扩展）
- **收益**：
  - 降低模块间耦合，便于后续替换实现
  - 测试时可直接注入 mock 上下文，减少样板代码
  - 与“配置类型归 `types`、运行态能力归 `core`”的分层保持一致
- **回退策略**：若后续阶段未出现多实现或测试替身需求，可回退为单类实现（`ExecutionContext`），并同步更新 Phase 文档签名

---

## ADR-010：Context 命名口径统一为 `I*` 接口 + `ExecutionContext` 实现

- **状态**：已采纳
- **背景**：在 Phase 3.4 落地后，团队确认保留“接口以 `I` 前缀命名”的风格（如 `IExecutionContext`），同时不再使用 `DefaultExecutionContext` 命名，避免类名冗余。
- **决策**：`core/context.ts` 采用 `IExecutionContext`（接口） + `ExecutionContext`（实现类）的组合；后续 3.5+ 模块签名继续优先依赖接口类型。
- **执行约束**：
  - 新增/修改上下文相关参数时，类型签名统一使用 `IExecutionContext`
  - 实例化处统一使用 `new ExecutionContext(inputs)`
  - 文档和示例中若出现 `DefaultExecutionContext`，后续迭代时同步收敛到 `ExecutionContext`
- **收益**：
  - 保留接口优先的可替换性
  - 减少实现类命名噪音，提高可读性
  - 与当前已实现代码一致，降低迁移成本
- **回退策略**：若后续证明接口抽象无收益，可退回单类实现；若出现多实现需求，可在不破坏当前命名的前提下新增实现类

---

## ADR-011：暂停 Phase 3，优先实施 Phase 4 数据库 API

- **状态**：已采纳
- **背景**：Phase 3 AI Engine 已完成至 3.9（Start/End/LLM/HTTP 执行器），但面试中 PostgreSQL 相关的 claim（seed 流程、CRUD 查询、事务、分页）缺乏可验证的代码证据链。仅靠 `schema.prisma` 的数据模型设计不足以支撑面试深挖。
- **决策**：暂停 Phase 3（3.10~3.14），优先实施 Phase 4 数据库 API 补强
- **Phase 4 任务清单**：
  - P0: seed 脚本（初始化 User/App/Workflow 示例数据）+ App CRUD 模块 + 发布接口（事务）
  - P1: 执行历史查询接口（分页 + status 筛选 + startedAt 倒序）+ PrismaService 连接池显式配置（connection_limit）
  - P2: 第二次 migration（演示 schema 演进）
- **原因**：
  1. seed/CRUD/事务/分页查询是 PostgreSQL 面试高频考点，需可运行代码作为证据
  2. Phase 4 的 6 项任务不依赖 AI Engine（Phase 3），可独立实施
  3. `PostgreSQL-面试准备.md` 已建立 claim → 代码定位的映射，需通过编码落地这些代码位置
- **影响**：Phase 3 的 3.10（Intention 执行器）~3.14（示例+测试）暂停，Phase 4 完成后回来继续
- **关联文件**：`PostgreSQL-面试准备.md`（新建）

---

## ADR-012：Phase 4 合并原 Phase4(App CRUD) + 原 Phase9(发布/API Key/Guard/执行占位) 范围

- **状态**：已采纳
- **背景**：ADR-007 将 Phase4 严格映射为 miaoma 原 Phase9（业务 API + 鉴权）；ADR-011 把 Phase4 重新定向为"PostgreSQL 补强"（面试证据驱动）。实际编写 phase4 文档时发现：4.2 App CRUD 其实属于 miaoma 原 Phase4 内容，而原 Phase9 的核心内容——API Key 管理、API Key Guard、外部执行接口（`POST /v1/apps/run`）——完全缺失，导致"业务 API + 鉴权"里的"鉴权"部分没有落地，Phase 编号与实际内容脱节。
- **决策**：Phase4 范围正式合并为：**原 Phase4（App CRUD） + 原 Phase9（发布事务 / API Key 管理 / API Key Guard / 外部执行接口）**，不再追求与 miaoma 单一 Phase 编号严格一一对应。
- **9.4 外部执行接口的处理方式**：真正"执行工作流"依赖 Phase 3.11（引擎主循环），当前该模块暂停中。采用**占位实现**：Guard 正常生效鉴权、`AppExecution` 记录真实创建并写入数据库，但执行结果直接标记为 `ERROR` 并注明"引擎未接入"，不真正调用引擎。等 Phase 3.11 完成后，只需替换中间的执行调用逻辑，Controller / Guard / DTO 均不变。
- **原因**：
  1. API Key Guard、发布事务、执行记录都是零前端依赖、零引擎依赖的纯 CRUD/中间件逻辑，符合"PostgreSQL 补强需要独立验证路径"的要求
  2. 占位式的执行接口既能验证鉴权链路完整性，又不会被 Phase 3.11 未完成阻塞
  3. 避免"鉴权"这个 claim 长期悬空，是原 Phase4 定位（业务 API + 鉴权）里明确要求的能力
- **影响**：
  - `phase/phase4-PostgreSQL补强.md` 新增 4.7（API Key 管理）、4.8（API Key Guard）、4.9（外部执行接口占位版）
  - `miaoma-aiflow-项目分析与学习路线.md` 两处映射表需同步更新，标注合并范围
- **关联文件**：`phase/phase4-PostgreSQL补强.md`、`miaoma-aiflow-项目分析与学习路线.md`
