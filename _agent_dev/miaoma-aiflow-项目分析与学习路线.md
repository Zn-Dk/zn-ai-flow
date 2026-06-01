# Miaoma AIFlow 完整版 — 项目分析与学习路线

> 基于 `miaoma-aiflow`（V1 完整版）源码的深度分析。
> 学习目标：从 0 到 1 重新实现一个全栈 AI 工作流编排平台。
> V2 插件版作为进阶选修参考，不作为主力学习目标。

---

## 一、项目概览

### 1.1 项目定位

这是一个**生产级 AI 工作流编排平台**，类似 Dify / Coze 的完整实现。核心能力：

- 可视化工作流编辑器（拖拽节点、连线、配置）
- 6 种内置节点类型（Start / LLM / HTTP / Condition / Knowledge / End）
- AI 工作流执行引擎（基于 LangChain + 拓扑排序）
- 知识库 RAG 系统（文档分块 + Qdrant 向量检索）
- 用户认证系统（注册/登录/邮箱验证）
- 应用发布 + API Key 管理 + 外部调用
- 执行监控 + 统计面板

### 1.2 技术栈总览

| 层级           | 技术选型                                                      | 版本                  |
| -------------- | ------------------------------------------------------------- | --------------------- |
| **Monorepo**   | pnpm workspace + Turborepo                                    | pnpm 9.12 / turbo 2.2 |
| **前端框架**   | Next.js (App Router)                                          | 16.1.1                |
| **UI**         | React 19 + Tailwind CSS v4 + shadcn/ui (Radix)                | -                     |
| **流程图**     | @xyflow/react (React Flow)                                    | ^12.9.3               |
| **富文本**     | Tiptap (Mention + Slash Command)                              | ^3.14.0               |
| **表单**       | react-hook-form + zod                                         | -                     |
| **图表**       | Recharts                                                      | 2.15.4                |
| **后端框架**   | NestJS                                                        | ^11.0.1               |
| **ORM**        | Prisma 7 (pg adapter)                                         | ^7.2.0                |
| **数据库**     | PostgreSQL 18                                                 | Docker                |
| **向量数据库** | Qdrant                                                        | v1.1.1                |
| **AI 引擎**    | LangChain + Ollama                                            | ^1.0.0                |
| **认证**       | bcryptjs + JWT (自实现)                                       | -                     |
| **构建**       | tsup (packages) + nest build (api) + next build (web)         | -                     |
| **代码规范**   | ESLint 9 flat config + Prettier + Commitlint + cz-git + Husky | -                     |

---

## 二、项目结构解析

### 2.1 Monorepo 顶层架构

```
miaoma-aiflow/
├── apps/
│   ├── api-server/          # NestJS 后端 API（端口 3100）
│   ├── workflow/            # Next.js 工作流编辑器前端（主力前端）
│   └── webapp/              # Next.js 工作流运行器（外部调用演示）
├── packages/
│   └── ai-engine/           # AI 工作流执行引擎（核心库）
├── docker/
│   └── docker-compose.yml   # PostgreSQL + Qdrant
├── turbo.json               # Turborepo 任务编排
├── eslint.config.js         # 统一 ESLint flat config
├── commitlint.config.js     # Git 提交规范
└── package.json             # 根配置（工程化工具链）
```

### 2.2 后端 `api-server` 结构

```
apps/api-server/
├── src/
│   ├── main.ts                         # 入口：全局前缀/CORS/ValidationPipe/ExceptionFilter/Interceptor
│   ├── app.module.ts                   # 根模块：ConfigModule + PrismaModule + WorkflowModule
│   ├── common/
│   │   ├── decorators/                 # 自定义装饰器
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts  # 全局异常过滤器
│   │   ├── guards/
│   │   │   └── api-key.guard.ts        # API Key 认证守卫
│   │   └── interceptors/
│   │       └── transform.interceptor.ts  # 统一响应格式拦截器
│   ├── modules/
│   │   └── workflow/
│   │       ├── workflow.module.ts
│   │       ├── workflow.controller.ts   # 路由：POST /api/v1/apps/run
│   │       ├── workflow.service.ts      # 工作流执行（同步 + SSE 流式）
│   │       └── dto/
│   │           └── run-workflow.dto.ts  # 请求验证 DTO
│   └── prisma/
│       ├── prisma.module.ts            # @Global() 全局模块
│       └── prisma.service.ts           # pg Pool + PrismaPg adapter
├── prisma/
│   └── schema.prisma                   # 9 个 Model（244 行）
└── .env                                # DATABASE_URL
```

### 2.3 前端 `workflow` 结构

```
apps/workflow/
├── app/
│   ├── (main)/                         # 路由组：应用列表
│   │   ├── apps/page.tsx               # 应用卡片列表
│   │   └── layout.tsx                  # 侧边栏布局
│   ├── account/
│   │   ├── login/page.tsx              # 登录页（含动画）
│   │   └── verify/page.tsx             # 邮箱验证页
│   ├── app/[id]/                       # 单应用详情
│   │   ├── workflow/page.tsx           # 工作流编辑器
│   │   ├── api/page.tsx                # API 文档 + Key 管理
│   │   ├── execution-logs/page.tsx     # 执行日志
│   │   └── monitoring/page.tsx         # 监控面板
│   ├── knowledge/                      # 知识库管理
│   │   ├── page.tsx                    # 知识库列表
│   │   └── [id]/                       # 单知识库
│   │       ├── documents/page.tsx      # 文档管理
│   │       ├── search/page.tsx         # 检索测试
│   │       └── settings/page.tsx       # 知识库设置
│   ├── tools/page.tsx                  # 工具页（预留）
│   └── api/                            # Next.js Route Handlers（BFF 层）
│       ├── auth/                       # 认证 API（register/login/logout/me/verify）
│       ├── apps/                       # 应用 CRUD + 发布/下架
│       │   └── [id]/
│       │       ├── workflow/           # 工作流保存/执行/历史
│       │       ├── api-keys/           # API Key CRUD
│       │       ├── publish/            # 发布
│       │       ├── executions/         # 执行历史
│       │       └── stats/             # 统计数据
│       └── knowledge/                  # 知识库 API
├── components/
│   ├── flow/                           # 工作流编辑器组件群
│   │   ├── editor/                     # 编辑器主体（ReactFlow + 状态管理）
│   │   ├── nodes/                      # 6 种自定义节点组件
│   │   ├── edges/                      # 自定义边
│   │   ├── handle/                     # 自定义连接点
│   │   ├── settings/                   # 节点配置面板
│   │   │   ├── forms/                  # 各节点类型的配置表单
│   │   │   └── variable-editor/        # Tiptap 变量编辑器
│   │   ├── test-run/                   # 测试运行面板
│   │   └── execution-history/          # 执行历史面板
│   ├── knowledge/                      # 知识库组件群
│   ├── monitoring/                     # 监控面板组件群
│   ├── api/                            # API 文档 + Key 管理组件
│   └── ui/                             # shadcn/ui 基础组件（30+ 个）
└── hooks/
    └── use-mobile.ts
```

### 2.4 核心引擎 `ai-engine` 结构

```
packages/ai-engine/
├── src/
│   ├── core/
│   │   ├── engine.ts                   # WorkflowEngine 主类（拓扑排序执行）
│   │   ├── graph-builder.ts            # 图构建器（DAG + 环检测 + 分支选择）
│   │   ├── context.ts                  # 执行上下文（变量存储 + 节点状态）
│   │   └── variable-resolver.ts        # 变量解析器（模板引用替换）
│   ├── nodes/
│   │   ├── registry.ts                 # 节点注册中心
│   │   ├── base-executor.ts            # 基类执行器
│   │   └── executors/
│   │       ├── start-executor.ts       # 开始节点
│   │       ├── llm-executor.ts         # LLM 节点（Ollama 调用）
│   │       ├── http-executor.ts        # HTTP 请求节点
│   │       ├── condition-executor.ts   # 条件分支节点
│   │       ├── knowledge-executor.ts   # 知识库检索节点
│   │       └── end-executor.ts         # 结束节点
│   ├── knowledge/
│   │   ├── types.ts                    # RAG 类型定义（253 行）
│   │   ├── chunking/                   # 文本分块（通用 + Markdown）
│   │   ├── embeddings/                 # 嵌入服务（Ollama）
│   │   ├── store/                      # 向量存储（Qdrant）
│   │   └── retriever/                  # 检索器（向量 + 混合）
│   ├── validators/                     # 工作流验证器
│   ├── logger/                         # 执行日志系统
│   ├── types/                          # 核心类型定义
│   └── example/
│       └── run-workflow.ts             # 独立运行示例
├── tsup.config.ts                      # 双格式构建（ESM + CJS）
└── vitest.config.ts                    # 单元测试配置
```

### 2.5 数据模型（9 个 Model）

```
User ──1:N──> App ──1:N──> Workflow（编辑版本）
                │
                ├──1:N──> PublishedApp（发布快照）
                ├──1:N──> ApiKey
                └──1:N──> WorkflowExecution（测试执行）

PublishedApp ──1:N──> AppExecution（API 调用执行）

User ──1:N──> KnowledgeBase ──1:N──> Document
```

关键设计：

- App 有 `activePublishedId` 指向当前激活的发布版本
- PublishedApp 是工作流的**快照**（nodes + edges 独立存储）
- WorkflowExecution 记录编辑器内的测试运行
- AppExecution 记录通过 API Key 的外部调用

---

## 三、学习路线（从 0 到 1 实现）

> ⚠️ **实际实施编号调整**：原文档按 miaoma 完整版规划了 11 个 Phase。实际实施中，我们跳过了用户认证（Phase 3）和部分前端（Phase 4/5），重新组织为以下优先级：
>
> | 实施 Phase | 对应原规划   | 内容                                         |
> | ---------- | ------------ | -------------------------------------------- |
> | Phase 1    | Phase 1      | 工程化基础 ✅                                |
> | Phase 2    | Phase 2      | 后端基础设施 ✅                              |
> | Phase 3    | Phase 6      | AI 工作流引擎（`packages/ai-engine`）        |
> | Phase 4    | Phase 9      | 业务 API + 鉴权（`apps/api-server/modules`） |
> | Phase 5    | Phase 8      | 知识库 RAG（可选）                           |
> | Phase 6+   | Phase 5/7/10 | 前端编辑器 + 监控（后续规划）                |
>
> 以下保留原始完整规划作为参考。

### Phase 1：工程化基础（1-2 天）

| 步骤 | 任务                               | 关键知识点                                                     |
| ---- | ---------------------------------- | -------------------------------------------------------------- |
| 1.1  | 初始化 pnpm workspace + Turborepo  | `pnpm-workspace.yaml`、`turbo.json`（`dependsOn: ["^build"]`） |
| 1.2  | 配置 TypeScript（根 + 子项目继承） | `tsconfig.json` 分层（base/client/server）                     |
| 1.3  | 配置 ESLint 9 flat config          | 按子项目差异化规则（workflow/api-server/packages）             |
| 1.4  | 配置 Prettier                      | 4 空格、单引号、无分号、`printWidth: 140`                      |
| 1.5  | 配置 Commitlint + cz-git           | Emoji 提交、scope 枚举（自动扫描 apps/packages）               |
| 1.6  | 配置 Husky + lint-staged           | pre-commit 自动 lint + format                                  |
| 1.7  | 配置 Docker Compose                | PostgreSQL 18 + Qdrant v1.1.1                                  |

**验证**：`pnpm lint` / `pnpm commit` / `pnpm docker:start` 均正常工作。

---

### Phase 2：后端基础设施（2-3 天）

| 步骤 | 任务                | 关键知识点                                                 |
| ---- | ------------------- | ---------------------------------------------------------- |
| 2.1  | 初始化 NestJS 项目  | `@nestjs/cli`、模块化架构                                  |
| 2.2  | 全局配置            | `ConfigModule.forRoot()`、全局路由前缀 `/api`              |
| 2.3  | Prisma 7 集成       | `@prisma/adapter-pg` + `pg` Pool、`@Global()` PrismaModule |
| 2.4  | 全局 ValidationPipe | `class-validator` + `class-transformer`、DTO 白名单        |
| 2.5  | 全局异常过滤器      | `GlobalExceptionFilter`、统一错误格式                      |
| 2.6  | 全局响应拦截器      | `TransformInterceptor`、统一 `{ code, data, message }`     |
| 2.7  | 定义数据模型        | 9 个 Model + 关系 + 索引                                   |
| 2.8  | 数据库迁移          | `prisma migrate dev`                                       |

**验证**：API 服务启动在 3100 端口，`GET /api` 返回统一格式响应。

---

### Phase 3：用户认证系统（1-2 天）

| 步骤 | 任务       | 关键知识点                                            |
| ---- | ---------- | ----------------------------------------------------- |
| 3.1  | 注册接口   | bcryptjs 密码哈希、邮箱唯一校验                       |
| 3.2  | 登录接口   | JWT 签发、Cookie 设置                                 |
| 3.3  | 邮箱验证   | verifyToken 生成、nodemailer 发送                     |
| 3.4  | 认证中间件 | JWT 解析、`/api/auth/me` 获取当前用户                 |
| 3.5  | 前端登录页 | Next.js App Router、表单验证（react-hook-form + zod） |

**验证**：完整注册 → 登录 → 获取用户信息流程。

---

### Phase 4：应用管理 CRUD（2 天）

| 步骤 | 任务                | 关键知识点                                        |
| ---- | ------------------- | ------------------------------------------------- |
| 4.1  | 应用列表 API        | Next.js Route Handler（BFF 模式）、Prisma 查询    |
| 4.2  | 创建/编辑/删除应用  | Dialog 组件、react-hook-form                      |
| 4.3  | 应用卡片列表 UI     | shadcn/ui Card、Grid 布局                         |
| 4.4  | 侧边栏导航          | App Router 路由组 `(main)`、`app/[id]/layout.tsx` |
| 4.5  | 应用详情页 Tab 布局 | workflow / api / logs / monitoring 四个 Tab       |

**验证**：能创建应用、进入应用详情页、切换 Tab。

---

### Phase 5：工作流编辑器（3-5 天）⭐ 核心

| 步骤 | 任务                 | 关键知识点                                                                                                                             |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | React Flow 基础集成  | `ReactFlowProvider`、`nodeTypes` 注册                                                                                                  |
| 5.2  | 6 种自定义节点组件   | `NodeProps` 类型、Handle 连接点                                                                                                        |
| 5.3  | 自定义边             | 动画边、删除按钮                                                                                                                       |
| 5.4  | 节点面板（添加节点） | 拖拽添加、`@dnd-kit`                                                                                                                   |
| 5.5  | 节点配置面板         | 右侧 Settings 面板、表单注册中心                                                                                                       |
| 5.6  | 各节点配置表单       | Start（输入变量定义）、LLM（模型/Prompt）、HTTP（URL/Method/Headers）、Condition（条件规则）、Knowledge（知识库选择）、End（输出映射） |
| 5.7  | 变量编辑器           | Tiptap + Mention 扩展 + Slash Command                                                                                                  |
| 5.8  | 工作流保存/加载      | API 调用、节点+边序列化                                                                                                                |
| 5.9  | 编辑器 Header        | 保存/发布/运行按钮、模式切换                                                                                                           |

**验证**：能拖拽创建节点、连线、配置参数、保存工作流。

---

### Phase 6：AI 执行引擎（3-4 天）⭐ 核心

| 步骤 | 任务             | 关键知识点                                              |
| ---- | ---------------- | ------------------------------------------------------- |
| 6.1  | 引擎架构设计     | `WorkflowEngine` 类、`NodeRegistry`、`BaseNodeExecutor` |
| 6.2  | 图构建器         | DAG 拓扑排序、环检测、条件分支选择                      |
| 6.3  | 执行上下文       | 变量存储、节点状态追踪、上游输出传递                    |
| 6.4  | 变量解析器       | Handlebars 模板、`{{node_id.output_key}}` 语法          |
| 6.5  | Start 执行器     | 输入参数透传                                            |
| 6.6  | LLM 执行器       | `@langchain/ollama` 调用、Prompt 模板渲染               |
| 6.7  | HTTP 执行器      | fetch 请求、Header/Body 变量替换                        |
| 6.8  | Condition 执行器 | 多条件规则匹配、分支选择                                |
| 6.9  | End 执行器       | 输出收集、变量映射                                      |
| 6.10 | 执行日志系统     | `ExecutionLogger`、分级日志、节点追踪                   |
| 6.11 | 工作流验证器     | 结构验证（有 Start/End、无环、连通性）                  |
| 6.12 | tsup 双格式构建  | ESM + CJS 输出、`workspace:*` 引用                      |

**验证**：`pnpm example` 能独立运行工作流示例，输出正确结果。

---

### Phase 7：测试运行 + 执行追踪（2 天）

| 步骤 | 任务              | 关键知识点                                 |
| ---- | ----------------- | ------------------------------------------ |
| 7.1  | 测试运行面板 UI   | 输入 Tab + 结果 Tab + 详情 Tab + Trace Tab |
| 7.2  | 工作流执行 API    | Next.js Route Handler 调用 ai-engine       |
| 7.3  | 执行记录存储      | WorkflowExecution 表、nodeTraces JSON      |
| 7.4  | 执行历史列表      | 时间线展示、状态标记                       |
| 7.5  | 节点级 Trace 展示 | 每个节点的输入/输出/耗时/状态              |

**验证**：在编辑器中点击"运行"，能看到实时执行过程和结果。

---

### Phase 8：知识库 RAG 系统（3-4 天）⭐ 核心

| 步骤 | 任务                 | 关键知识点                                           |
| ---- | -------------------- | ---------------------------------------------------- |
| 8.1  | 知识库 CRUD          | KnowledgeBase 模型、列表/创建/删除                   |
| 8.2  | 文档管理             | Document 模型、文件上传、文本提取                    |
| 8.3  | 文本分块             | `TextSplitter`（通用）+ `MarkdownSplitter`（按标题） |
| 8.4  | 嵌入服务             | Ollama `mxbai-embed-large` 模型、批量嵌入            |
| 8.5  | Qdrant 向量存储      | 集合管理、upsert、按文档/知识库删除                  |
| 8.6  | 向量检索             | `VectorRetriever`、topK + threshold                  |
| 8.7  | 混合检索             | `HybridRetriever`、向量 + 全文、权重融合             |
| 8.8  | Knowledge 节点执行器 | 在工作流中调用检索，注入上下文                       |
| 8.9  | 检索测试 UI          | 知识库搜索测试页面                                   |
| 8.10 | 文档分块预览         | Chunk Drawer 组件                                    |

**验证**：上传文档 → 自动分块嵌入 → 在工作流中使用 Knowledge 节点检索相关内容。

---

### Phase 9：应用发布 + API 调用（2 天）

| 步骤 | 任务              | 关键知识点                                          |
| ---- | ----------------- | --------------------------------------------------- |
| 9.1  | 发布接口          | 创建 PublishedApp 快照（复制 nodes + edges）        |
| 9.2  | API Key 管理      | 生成 `sk-xxx` 格式 Key、CRUD                        |
| 9.3  | API Key Guard     | NestJS Guard、请求头 `Authorization: Bearer sk-xxx` |
| 9.4  | 外部执行接口      | `POST /api/v1/apps/run`（同步 + SSE 流式）          |
| 9.5  | AppExecution 记录 | 区分测试执行 vs API 调用执行                        |
| 9.6  | API 文档页        | 接口说明、curl 示例、Key 列表                       |
| 9.7  | webapp 演示       | 独立 Next.js 应用调用已发布的工作流                 |

**验证**：发布应用 → 创建 API Key → 用 curl 调用 → 返回执行结果。

---

### Phase 10：监控面板（1 天）

| 步骤 | 任务             | 关键知识点                   |
| ---- | ---------------- | ---------------------------- |
| 10.1 | 统计 API         | 调用次数、Token 消耗、成功率 |
| 10.2 | 概览卡片         | StatsOverview 组件           |
| 10.3 | 调用趋势图       | Recharts 折线图              |
| 10.4 | Token 消耗图     | Recharts 柱状图              |
| 10.5 | API Key 使用排行 | 表格展示                     |

**验证**：监控面板展示真实的调用统计数据。

---

### Phase 11（选修）：V2 插件系统

> 仅在 Phase 1-10 完成后，且有余力时学习。

| 步骤 | 任务                  | 关键知识点                           |
| ---- | --------------------- | ------------------------------------ |
| 11.1 | plugin-core 类型定义  | `plugin.json` Schema、节点描述协议   |
| 11.2 | plugin-runtime 加载器 | CDN 动态加载 UMD 模块                |
| 11.3 | 沙箱隔离              | `Proxy` 权限代理、受限 API 白名单    |
| 11.4 | plugin-market-server  | 独立 NestJS 服务、插件注册/版本管理  |
| 11.5 | 前端插件市场          | 浏览/安装/卸载/发布 UI               |
| 11.6 | 动态节点注册          | 安装插件后自动注册新节点类型到编辑器 |

---

## 四、核心架构设计分析

### 4.1 工作流执行引擎架构

```
┌─────────────────────────────────────────────────────────┐
│                   WorkflowEngine                         │
├─────────────────────────────────────────────────────────┤
│  1. validate(workflow)     → WorkflowValidator          │
│  2. GraphBuilder(workflow) → 拓扑排序 + 环检测           │
│  3. createExecutionContext → 变量存储 + 节点状态         │
│  4. for node of executionOrder:                         │
│       executor = registry.get(node.type)                │
│       result = executor.execute(node, context, logger)  │
│       context.markNodeCompleted(node.id)                │
│       if condition → graphBuilder.selectBranch()        │
│  5. return { outputs, logs, duration }                  │
└─────────────────────────────────────────────────────────┘
```

关键设计决策：

- **注册中心模式**：`NodeRegistry` 管理所有节点执行器，支持扩展
- **拓扑排序执行**：`GraphBuilder` 确保节点按依赖顺序执行
- **条件分支动态裁剪**：条件节点执行后重新计算执行路径
- **上下文传递**：通过 `ExecutionContext` 在节点间传递变量
- **回调机制**：`onNodeStart` / `onNodeEnd` / `onLog` 支持实时追踪

### 4.2 前端 BFF 架构

```
浏览器 → Next.js Route Handler (BFF) → Prisma (直连 DB)
                                      → ai-engine (工作流执行)
                                      → Qdrant (向量检索)

外部调用 → NestJS api-server → ai-engine (工作流执行)
                              → Prisma (执行记录)
```

设计要点：

- **workflow 前端**使用 Next.js Route Handler 作为 BFF，直接操作数据库
- **api-server** 仅服务外部 API 调用（通过 API Key 认证）
- 两者共享 `@miaoma-aiflow/ai-engine` 包执行工作流

### 4.3 变量系统设计

```
节点 A 输出 → context.variables.setNodeOutputs('nodeA', outputs)
                                    ↓
节点 B 配置中引用 → "{{nodeA.result}}"
                                    ↓
VariableResolver.resolve(template, context) → 替换为实际值
```

前端变量编辑器使用 Tiptap Mention 扩展，将变量引用渲染为可视化标签。

---

## 五、源码问题分析与实施注意事项

### 5.1 🟢 值得学习的设计模式

| 设计                  | 说明                                                  |
| --------------------- | ----------------------------------------------------- |
| Prisma 7 pg adapter   | 原生 `pg` 连接池 + Prisma adapter，性能优于默认驱动   |
| 全局模块 + 生命周期   | `@Global()` + `OnModuleInit/Destroy` 管理连接池       |
| ValidationPipe 白名单 | `whitelist + forbidNonWhitelisted` 防止注入           |
| 统一响应拦截器        | `TransformInterceptor` 包装 `{ code, data, message }` |
| 全局异常过滤器        | 统一错误格式，区分业务异常和系统异常                  |
| 节点注册中心          | 策略模式，新增节点类型只需注册执行器                  |
| 图构建器              | 拓扑排序 + 环检测 + 动态分支裁剪                      |
| PublishedApp 快照     | 发布时复制 nodes/edges，编辑不影响已发布版本          |
| BFF 模式              | 前端 Route Handler 直连 DB，减少网络跳转              |
| tsup 双格式构建       | ESM + CJS 同时输出，兼容不同消费方                    |

### 5.2 🟡 需要注意的实施细节

| 问题             | 说明                                                        | 建议                                   |
| ---------------- | ----------------------------------------------------------- | -------------------------------------- |
| 前端直连 DB      | workflow 的 Route Handler 直接使用 Prisma，无认证中间件复用 | 每个 Route Handler 需手动校验 JWT      |
| 工作流执行无超时 | engine 的 `defaultTimeout` 配置了但未实际使用               | 为每个节点执行添加 `Promise.race` 超时 |
| SSE 流式执行     | `workflow.service.ts` 支持 SSE 但前端测试运行未使用         | 可扩展为实时进度展示                   |
| Token 统计       | 代码中有 `totalTokens` 字段但标注 `TODO`                    | 需从 LLM 响应中提取 usage 信息         |
| 知识库嵌入同步   | 文档上传后同步嵌入，大文件可能超时                          | 考虑异步队列处理                       |
| 条件节点         | 仅支持简单规则匹配，不支持复杂表达式                        | 可引入表达式引擎                       |

### 5.3 🔴 安全注意事项

| 问题         | 说明                                        |
| ------------ | ------------------------------------------- |
| `.env` 文件  | 包含数据库密码，确保 `.gitignore` 正确配置  |
| API Key 存储 | 明文存储在数据库中，生产环境应哈希存储      |
| CORS 配置    | `origin: true` 允许所有来源，生产环境需限制 |
| JWT Secret   | 应从环境变量读取，不要硬编码                |

---

## 六、关键依赖版本参考

```json
{
  "运行时": {
    "node": "22 (LTS)",
    "pnpm": "9.12.3"
  },
  "前端": {
    "next": "16.1.1",
    "react": "19.2.0",
    "@xyflow/react": "^12.9.3",
    "@tiptap/react": "^3.14.0",
    "tailwindcss": "4.1.18",
    "react-hook-form": "^7.67.0",
    "zod": "^4.1.13",
    "recharts": "2.15.4"
  },
  "后端": {
    "@nestjs/core": "^11.0.1",
    "prisma": "^7.2.0",
    "@prisma/adapter-pg": "^7.2.0",
    "class-validator": "^0.14.3"
  },
  "AI 引擎": {
    "@langchain/core": "^1.0.3",
    "@langchain/langgraph": "^1.0.0",
    "@langchain/ollama": "^1.0.0",
    "@qdrant/js-client-rest": "^1.16.2"
  },
  "工程化": {
    "turbo": "2.2.3",
    "tsup": "8.3.5",
    "eslint": "9.39.1",
    "typescript": "5.9.3",
    "vitest": "^4.0.16"
  }
}
```

---

## 七、快速启动命令

```bash
# 1. 启动基础设施
pnpm docker:start

# 2. 安装依赖
pnpm install

# 3. 构建共享包
pnpm build          # Turborepo 按依赖顺序构建

# 4. 数据库迁移（在 apps/workflow 目录下，因为前端直连 DB）
cd apps/workflow && npx prisma migrate dev

# 5. 启动全部开发服务
pnpm dev            # Turborepo 并行启动所有 dev 任务

# 6. 单独启动
cd apps/api-server && pnpm start:dev    # 后端 :3100
cd apps/workflow && pnpm dev            # 前端 :3000

# 7. 运行 AI 引擎示例
cd packages/ai-engine && pnpm example

# 8. 运行测试
cd packages/ai-engine && pnpm test
```

---

## 八、学习时间估算

> 以下为 miaoma 原始完整版规划。实际实施中按 Phase 3→4→5 的顺序推进（见"三、学习路线"顶部的映射表）。

| Phase      | 内容            | 预计时间     | 实施映射      |
| ---------- | --------------- | ------------ | ------------- |
| 1          | 工程化基础      | 1-2 天       | ✅ 已完成     |
| 2          | 后端基础设施    | 2-3 天       | ✅ 已完成     |
| 3（原）    | 用户认证        | 1-2 天       | ⏭️ 跳过       |
| 4（原）    | 应用管理 CRUD   | 2 天         | → Phase 6+    |
| 5（原）    | 工作流编辑器 ⭐ | 3-5 天       | → Phase 6+    |
| 6（原）    | AI 执行引擎 ⭐  | 3-4 天       | → **Phase 3** |
| 7（原）    | 测试运行 + 追踪 | 2 天         | → Phase 6+    |
| 8（原）    | 知识库 RAG ⭐   | 3-4 天       | → **Phase 5** |
| 9（原）    | 应用发布 + API  | 2 天         | → **Phase 4** |
| 10（原）   | 监控面板        | 1 天         | → Phase 6+    |
| **合计**   |                 | **20-27 天** |               |
| 11（选修） | V2 插件系统     | 5-7 天       | ⏭️ 跳过       |

---

## 九、面试亮点提炼

按优先级排序，面试时可重点展开的技术点：

1. **工作流引擎设计**：拓扑排序执行、条件分支动态裁剪、变量解析系统
2. **RAG 知识库**：文本分块策略、向量嵌入、混合检索、Qdrant 集成
3. **可视化编辑器**：React Flow 自定义节点/边、Tiptap 变量引用、拖拽交互
4. **Monorepo 工程化**：Turborepo 任务编排、tsup 双格式构建、ESLint flat config
5. **全栈架构**：BFF 模式、Prisma 7 pg adapter、NestJS 全局管道/过滤器/拦截器
6. **应用发布体系**：版本快照、API Key 认证、SSE 流式执行
