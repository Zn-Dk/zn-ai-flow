# Phase 4：PostgreSQL 补强（NestJS 业务 API）

> **预计耗时**：4-5 天
> **前置条件**：Phase 2 已完成（NestJS + Prisma + 全局拦截器/过滤器就绪）
> **验证目标**：`curl` 能完成 App CRUD → 发布版本 → 创建 API Key → 用 API Key 调用外部执行接口（占位）→ 查询执行历史的完整链路
> **对应原规划**：miaoma-aiflow 原 Phase4（应用管理 CRUD）+ 原 Phase9（业务 API + 鉴权），合并范围见 ADR-012
> **决策依据**：[DECISIONS.md](../DECISIONS.md) ADR-011（暂停 Phase3）、ADR-012（合并范围 + 9.4 占位说明）

---

## 与 miaoma 的关键差异

> ⚠️ miaoma 的业务 API 实现在 `apps/workflow/`（Next.js App Router），本项目实现在 `apps/api-server/`（NestJS）。业务逻辑参考 miaoma，但实现方式按 NestJS 模式编写。

| 维度       | miaoma（参考）                  | zn-ai-flow（本项目）                      |
| ---------- | ------------------------------- | ----------------------------------------- |
| 框架       | Next.js App Router (`route.ts`) | NestJS Controller + Service + DTO         |
| 参数校验   | zod                             | class-validator DTO                       |
| 数据库访问 | 直接 `import { prisma }`        | 注入 `PrismaService`                      |
| 认证       | `getCurrentUserId()`（cookie）  | 暂用 `x-user-id` header 传入（后续替换）  |
| 发布事务   | 无事务（两步操作）              | **必须用 `$transaction`**                 |
| 响应格式   | `apiSuccess` / `apiError`       | `TransformInterceptor` + `GlobalExceptionFilter`（Phase 2 已完成） |

---

## 步骤总览

| 步骤 | 任务                                        | 优先级 | 简历 Claim           | 难度   |
| ---- | ------------------------------------------- | ------ | -------------------- | ------ |
| 4.1  | seed 脚本（初始化示例数据 + 执行记录）       | P0     | seed 流程            | ⭐     |
| 4.2  | App CRUD 模块（Controller + Service + DTO）  | P0     | 关系建模、列表查询   | ⭐⭐   |
| 4.3  | 发布接口 + 事务（快照 + activePublishedId）  | P0     | 分表建模、事务       | ⭐⭐⭐ |
| 4.4  | 执行历史查询接口（分页 + status 筛选）       | P1     | 索引设计、分页查询   | ⭐⭐   |
| 4.5  | PrismaService 连接池显式配置                 | P1     | 连接池管理           | ⭐     |
| 4.6  | 第二次 migration（演示 schema 演进）        | P2     | migrate 流程         | ⭐     |
| 4.7  | API Key 管理（生成/列表/撤销）              | P0     | 安全设计、脱敏       | ⭐⭐   |
| 4.8  | API Key Guard（鉴权中间件）                 | P0     | 鉴权、Guard 模式     | ⭐⭐   |
| 4.9  | 外部执行接口（占位版）                       | P0     | 鉴权链路、执行记录   | ⭐⭐   |

> 4.1~4.8 全部零前端依赖、零引擎依赖，可独立通过 curl 验证。4.9 因真正执行依赖 Phase 3.11（引擎主循环，当前暂停）先实现为占位版：鉴权与 `AppExecution` 记录链路完整，但不真正调用引擎，见 ADR-012。

---

## 4.1 seed 脚本

### 目标

创建 `prisma/seed.ts`，初始化 demo 用户 + 示例应用 + 示例工作流，一行命令即可看到完整数据链路。

### 关键步骤

1. **安装 `ts-node`**（Prisma 7 seed 默认用 ts-node 执行）：

   ```bash
   pnpm --filter api-server add -D ts-node
   ```

2. **在 `package.json` 中配置 seed 命令**：

   ```json
   {
     "prisma": {
       "seed": "ts-node prisma/seed.ts"
     }
   }
   ```

3. **创建 `prisma/seed.ts`**：

   > 💡 **`upsert` 的 `update` 字段与 `create` 保持同步**：每种记录先定义一个共享的 `xxxData` 对象，`create` 用它 + 主键/唯一键，`update` 直接复用同一个对象。这样无论 seed 脚本被执行多少次，数据库里的数据都会被同步成脚本里定义的**最新**状态，不会出现"改了 seed 代码但库里还是旧数据"的情况。

   ```ts
   import { PrismaClient } from '../src/generated/prisma/client'

   const prisma = new PrismaClient()

   async function main() {
     // 1. 创建 demo 用户（update 与 create 共享同一份数据，保证重复执行时始终同步到最新定义）
     const userData = { password: 'demo123456', name: 'Demo User' }
     const user = await prisma.user.upsert({
       where: { email: 'demo@zn-ai-flow.dev' },
       update: userData,
       create: { email: 'demo@zn-ai-flow.dev', ...userData },
     })

     // 2. 创建示例应用
     const appData = {
       name: '示例工作流应用',
       description: '用于 seed 初始化的示例应用',
       type: 'WORKFLOW' as const,
       userId: user.id,
     }
     const app = await prisma.app.upsert({
       where: { id: 'app-demo-001' },
       update: appData,
       create: { id: 'app-demo-001', ...appData },
     })

     // 3. 创建示例工作流（简单 Start → LLM → End 结构）
     const workflowData = {
       name: '示例工作流',
       appId: app.id,
       nodes: [
         { id: 'start_1', type: 'start', data: { label: '开始', config: { inputs: [] } }, position: { x: 100, y: 100 } },
         { id: 'llm_1', type: 'llm', data: { label: 'LLM', config: { model: 'qwen2.5:7b', messages: [{ role: 'user', content: '你好' }] } }, position: { x: 300, y: 100 } },
         { id: 'end_1', type: 'end', data: { label: '结束', config: { outputs: [{ name: 'result', type: 'string', value: '{{llm_1.content}}' }] } }, position: { x: 500, y: 100 } },
       ],
       edges: [
         { id: 'e1', source: 'start_1', target: 'llm_1' },
         { id: 'e2', source: 'llm_1', target: 'end_1' },
       ],
     }
     const workflow = await prisma.workflow.upsert({
       where: { id: 'wf-demo-001' },
       update: workflowData,
       create: { id: 'wf-demo-001', ...workflowData },
     })

     // 4. 创建 WorkflowExecution 测试数据（供 4.4 分页/筛选接口验证使用）
     //    覆盖三种 status + 不同 startedAt，验证 status 筛选和倒序排序
     const executionSeeds = [
       { executionId: 'exec-demo-001', status: 'SUCCESS' as const, offsetMinutes: 30 },
       { executionId: 'exec-demo-002', status: 'ERROR' as const, offsetMinutes: 20 },
       { executionId: 'exec-demo-003', status: 'SUCCESS' as const, offsetMinutes: 10 },
       { executionId: 'exec-demo-004', status: 'RUNNING' as const, offsetMinutes: 1 },
     ]
     for (const { executionId, status, offsetMinutes } of executionSeeds) {
       const startedAt = new Date(Date.now() - offsetMinutes * 60_000)
       const executionData = {
         status,
         appId: app.id,
         inputs: { topic: 'seed 测试' },
         outputs: status === 'SUCCESS' ? { result: 'mock 输出' } : undefined,
         error: status === 'ERROR' ? 'seed 模拟错误' : undefined,
         startedAt,
         completedAt: status === 'RUNNING' ? undefined : new Date(startedAt.getTime() + 5000),
       }
       await prisma.workflowExecution.upsert({
         where: { executionId },
         update: executionData,
         create: { executionId, ...executionData },
       })
     }

     console.log('Seed 完成:', { user: user.email, app: app.name, workflow: workflow.name, executions: executionSeeds.length })
   }

   main()
     .catch((e) => {
       console.error(e)
       process.exit(1)
     })
     .finally(async () => {
       await prisma.$disconnect()
     })
   ```

4. **执行 seed**：

   ```bash
   pnpm --filter api-server exec prisma db seed
   ```

5. **验证数据**：

   ```bash
   pnpm --filter api-server exec prisma studio
   # 确认 users / apps / workflows 各 1 条，workflow_executions 4 条（3种status）
   ```

### ⚠️ 踩坑点

- **为什么用 `upsert` 而不是 `create`**：脚本里固定写死了 `id`（如 `'app-demo-001'`）和 `email`（`@unique`）。这些字段在数据库层面强制唯一，用 `create` 重复执行会直接抛 `Unique constraint failed` 报错。而 seed 脚本在开发中会被反复执行（`prisma migrate reset` 自动触发、或手动刷新测试数据），如果每次都要先手动清库才能跑通，就失去了"一行命令拉起完整数据"的意义。`upsert` 命中已存在的唯一字段时不会报错，保证脚本**可重复执行（idempotent）**。
- **`update` 必须和 `create` 数据保持同步，不能写 `update: {}`**：`update: {}` 只解决了"不报错"，没解决"数据是否随脚本定义同步更新"。如果 `update` 是空对象，第二次运行时命中已存在记录会直接原样返回，**不会把数据库里的旧数据刷新成脚本里的最新定义**——比如后续把 `llm_1` 的模型从 `qwen2.5:7b` 改成别的，重新跑 seed 后数据库里其实还是旧配置，容易造成"改了脚本但没生效"的困惑排查成本。本文档统一用"共享 `xxxData` 对象，`create`/`update` 都复用它"的写法，保证每次执行都把库同步成脚本当前定义的状态。
- **`PrismaClient` import 路径**：从 `src/generated/prisma/client` 导入，不是 `@prisma/client`（Prisma 7 的变化）。
- **`ts-node` 与 CJS 模式**：`tsconfig.json` 是 `module: commonjs`，`ts-node` 默认走 CJS，不需要额外配置。
- **`nodes` / `edges` 字段是 `Json` 类型**：Prisma 接受原生 JS 对象/数组，不需要 `JSON.stringify`。
- **执行记录必须覆盖多种 status + 不同时间**：4.4 的分页/筛选接口如果没有多样化的测试数据，接口写完也验证不出"筛选是否生效""排序是否正确"。这是本项目对 4.1 的修正——初版 seed 只造了 User/App/Workflow，未造执行记录，导致 4.4 无法独立验证。

### 参考源码

- miaoma 无 seed 脚本，本项目新增
- Prisma 官方文档：[Database Seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)

---

## 4.2 App CRUD 模块

### 目标

在 `apps/api-server/src/modules/app/` 下创建 NestJS 模块，实现 App 的增删改查接口。

### 关键步骤

1. **创建文件结构**：

   ```
   src/modules/app/
   ├── app.module.ts          # 模块定义
   ├── app.controller.ts      # 路由控制器
   ├── app.service.ts         # 业务逻辑
   └── dto/
       ├── create-app.dto.ts  # 创建 DTO
       ├── update-app.dto.ts  # 更新 DTO
       └── query-app.dto.ts   # 列表查询 DTO
   ```

2. **DTO 定义**（class-validator）：

   ```ts
   // create-app.dto.ts
   import { IsString, IsEnum, IsOptional, MaxLength, IsArray } from 'class-validator'

   export class CreateAppDto {
     @IsString()
     @MaxLength(50)
     name: string

     @IsString()
     @IsOptional()
     @MaxLength(200)
     description?: string

     @IsString()
     @IsOptional()
     icon?: string

     @IsEnum(['WORKFLOW', 'CHATBOT', 'AGENT'])
     @IsOptional()
     type?: string

     @IsArray()
     @IsString({ each: true })
     @IsOptional()
     tags?: string[]
   }
   ```

   ```ts
   // query-app.dto.ts
   import { IsString, IsOptional, IsInt, Min } from 'class-validator'

   export class QueryAppDto {
     @IsString()
     @IsOptional()
     search?: string

     @IsString()
     @IsOptional()
     type?: string  // 'WORKFLOW' | 'CHATBOT' | 'AGENT' | 'all'

     @IsInt()
     @Min(1)
     @IsOptional()
     page?: number  // 默认 1

     @IsInt()
     @Min(1)
     @IsOptional()
     pageSize?: number  // 默认 20
   }
   ```

3. **Service 核心逻辑**：

   ```ts
   @Injectable()
   export class AppService {
     constructor(private readonly prisma: PrismaService) {}

     // 列表查询（分页 + 搜索 + 类型筛选）
     async findAll(userId: string, query: QueryAppDto) {
       const { search, type, page = 1, pageSize = 20 } = query

       const where = {
         userId,
         isDeleted: false,
         ...(search && { name: { contains: search, mode: 'insensitive' as const } }),
         ...(type && type !== 'all' && { type: type as any }),
       }

       const [apps, total] = await Promise.all([
         this.prisma.app.findMany({
           where,
           orderBy: { updatedAt: 'desc' },
           skip: (page - 1) * pageSize,
           take: pageSize,
         }),
         this.prisma.app.count({ where }),
       ])

       return {
         items: apps,
         total,
         page,
         pageSize,
         totalPages: Math.ceil(total / pageSize),
       }
     }

     // 详情
     async findOne(userId: string, id: string) {
       const app = await this.prisma.app.findFirst({
         where: { id, userId, isDeleted: false },
         include: { workflows: true },
       })
       if (!app) throw new NotFoundException('应用不存在')
       return app
     }

     // 创建
     async create(userId: string, dto: CreateAppDto) {
       return this.prisma.app.create({
         data: { ...dto, userId },
       })
     }

     // 更新
     async update(userId: string, id: string, dto: UpdateAppDto) {
       const app = await this.prisma.app.findFirst({ where: { id, userId, isDeleted: false } })
       if (!app) throw new NotFoundException('应用不存在')
       return this.prisma.app.update({ where: { id }, data: dto })
     }

     // 软删除
     async remove(userId: string, id: string) {
       const app = await this.prisma.app.findFirst({ where: { id, userId, isDeleted: false } })
       if (!app) throw new NotFoundException('应用不存在')
       return this.prisma.app.update({ where: { id }, data: { isDeleted: true } })
     }
   }
   ```

4. **Controller 路由定义**：

   ```ts
   @Controller('apps')
   export class AppController {
     constructor(private readonly appService: AppService) {}

     @Get()
     findAll(@Headers('x-user-id') userId: string, @Query() query: QueryAppDto) {
       return this.appService.findAll(userId, query)
     }

     @Get(':id')
     findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
       return this.appService.findOne(userId, id)
     }

     @Post()
     create(@Headers('x-user-id') userId: string, @Body() dto: CreateAppDto) {
       return this.appService.create(userId, dto)
     }

     @Put(':id')
     update(@Headers('x-user-id') userId: string, @Param('id') id: string, @Body() dto: UpdateAppDto) {
       return this.appService.update(userId, id, dto)
     }

     @Delete(':id')
     remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
       return this.appService.remove(userId, id)
     }
   }
   ```

5. **在 `app.module.ts` 中注册 AppModule**。

### ⚠️ 踩坑点

- **`mode: 'insensitive'`**：PostgreSQL 的 `contains` 搜索默认大小写敏感，需加 `mode: 'insensitive'` 做模糊匹配。
- **软删除 vs 硬删除**：本项目用 `isDeleted: true` 软删除，不执行 `prisma.app.delete()`。查询时必须加 `isDeleted: false` 条件。
- **`x-user-id` header**：临时方案，后续认证模块实现后替换为 JWT 中间件注入的 `req.user.id`。当前阶段用 header 传入 seed 中的 demo 用户 ID。
- **`Promise.all` 并行查询**：`findMany` 和 `count` 没有依赖关系，用 `Promise.all` 并行执行，减少一次 RTT。
- **DTO 默认值**：`page` 和 `pageSize` 用 `@IsOptional()` + 解构时给默认值，不要在 DTO 类中直接赋值（ValidationPipe 的 `transform: true` 可能干扰）。
- **`findFirst` vs `findUnique`**：带 `userId` + `isDeleted` 条件时用 `findFirst`（不是唯一索引查询）；按 `id` 查可用 `findUnique`，但多条件查询用 `findFirst` 更灵活。

### 参考源码

- `miaoma-aiflow/apps/workflow/app/api/apps/route.ts`（GET 列表 + POST 创建）
- `miaoma-aiflow/apps/workflow/app/api/apps/[id]/route.ts`（GET 详情 + PUT 更新 + DELETE 删除）

---

## 4.3 发布接口 + 事务

### 目标

实现 `POST /api/apps/:id/publish`，将 Workflow 当前配置复制为 PublishedApp 快照，并在事务中更新 App.activePublishedId。

> ⚠️ **与 miaoma 的关键差异**：miaoma 的发布接口**没有用事务**（先 create PublishedApp，再 update App，两步独立操作）。本项目**必须用 `$transaction`**，这是面试核心 claim。

### 关键步骤

1. **创建文件**：`src/modules/app/app-publish.service.ts`（或直接放在 `app.service.ts` 中）

2. **核心逻辑**：

   ```ts
   async publish(userId: string, appId: string) {
     // 1. 验证应用存在 + 获取应用信息
     const app = await this.prisma.app.findFirst({
       where: { id: appId, userId, isDeleted: false },
       select: { id: true, name: true, description: true, isPublished: true },
     })
     if (!app) throw new NotFoundException('应用不存在')

     // 2. 获取最新工作流
     const workflow = await this.prisma.workflow.findFirst({
       where: { appId },
       orderBy: { updatedAt: 'desc' },
     })
     if (!workflow) throw new BadRequestException('工作流为空，无法发布')

     // 3. 验证工作流有效（有节点 + 有 start/end）
     const nodes = workflow.nodes as Array<{ type: string }>
     if (!nodes.length) throw new BadRequestException('工作流为空，无法发布')
     const types = nodes.map(n => n.type)
     if (!types.includes('start')) throw new BadRequestException('工作流缺少开始节点')
     if (!types.includes('end')) throw new BadRequestException('工作流缺少结束节点')

     // 4. 获取当前最大版本号
     const latest = await this.prisma.publishedApp.findFirst({
       where: { appId },
       orderBy: { version: 'desc' },
       select: { version: true },
     })
     const nextVersion = (latest?.version ?? 0) + 1

     // 5. 事务：创建快照 + 更新 App 激活版本
     const result = await this.prisma.$transaction(async (tx) => {
       // 5a. 创建发布快照（复制 Workflow 的 nodes/edges）
       const publishedApp = await tx.publishedApp.create({
         data: {
           version: nextVersion,
           name: app.name,
           description: app.description,
           nodes: workflow.nodes,
           edges: workflow.edges,
           appId,
           publishedBy: userId,
         },
       })

       // 5b. 更新 App 指向新版本
       await tx.app.update({
         where: { id: appId },
         data: {
           isPublished: true,
           activePublishedId: publishedApp.id,
           publishedAt: new Date(),
         },
       })

       return { publishedApp, isUpdate: app.isPublished }
     })

     return {
       isUpdate: result.isUpdate,
       version: nextVersion,
       publishedAppId: result.publishedApp.id,
     }
   }
   ```

3. **Controller 路由**：

   ```ts
   @Post(':id/publish')
   publish(@Headers('x-user-id') userId: string, @Param('id') id: string) {
     return this.appService.publish(userId, id)
   }
   ```

### ⚠️ 踩坑点

- **为什么必须用事务**：如果第 5a 步成功（快照已写入）但第 5b 步失败（App 未更新 activePublishedId），线上会继续调用旧版本——这是**静默不一致**，比报错更危险。事务保证要么全成功要么全回滚。
- **`$transaction` 交互式 API**：Prisma 提供两种事务 API——`$transaction([promise1, promise2])`（数组式，适合无依赖操作）和 `$transaction(async (tx) => { ... })`（回调式，适合有依赖操作）。本场景用回调式，因为第 5b 步需要引用 5a 步创建的 `publishedApp.id`。
- **miaoma 的设计缺陷**：miaoma 的发布接口没有用事务，先 `prisma.publishedApp.create()` 再 `prisma.app.update()`。面试时可以讲"我修正了参考实现中的事务遗漏"。
- **版本号自增**：`nextVersion = (latest?.version ?? 0) + 1`，通过 `@@unique([appId, version])` 在数据库层面保证不重复。如果两个请求同时发布同一个 App，数据库会拒绝重复版本号——这是兜底保障。
- **`publishedBy`**：记录发布者 ID，用于审计。
- **快照隔离**：PublishedApp 复制的是 Workflow 当前的 `nodes` / `edges`（Prisma `Json` 类型直接透传）。发布后继续编辑 Workflow 不影响已发布的快照。

### 参考源码

- `miaoma-aiflow/apps/workflow/app/api/apps/[id]/publish/route.ts`（⚠️ 无事务，本项目需修正）

---

## 4.4 执行历史查询接口

### 目标

实现 `GET /api/apps/:id/executions`，支持分页 + status 筛选 + startedAt 倒序。查询的是 `WorkflowExecution` 表（编辑器测试执行记录）。

### 关键步骤

1. **创建文件**：`src/modules/execution/execution.module.ts` + `execution.controller.ts` + `execution.service.ts`

2. **查询 DTO**：

   ```ts
   // query-execution.dto.ts
   import { IsString, IsOptional, IsInt, Min } from 'class-validator'

   export class QueryExecutionDto {
     @IsInt()
     @Min(1)
     @IsOptional()
     page?: number

     @IsInt()
     @Min(1)
     @IsOptional()
     pageSize?: number

     @IsString()
     @IsOptional()
     status?: string  // 'RUNNING' | 'SUCCESS' | 'ERROR' | 'all'
   }
   ```

3. **Service 核心逻辑**：

   ```ts
   @Injectable()
   export class ExecutionService {
     constructor(private readonly prisma: PrismaService) {}

     async findExecutions(userId: string, appId: string, query: QueryExecutionDto) {
       // 1. 验证应用归属
       const app = await this.prisma.app.findFirst({
         where: { id: appId, userId, isDeleted: false },
       })
       if (!app) throw new NotFoundException('应用不存在')

       const { status = 'all', page = 1, pageSize = 20 } = query

       // 2. 构建查询条件
       const where = {
         appId,
         ...(status !== 'all' && { status: status as any }),
       }

       // 3. 并行查询数据 + 总数
       const [executions, total] = await Promise.all([
         this.prisma.workflowExecution.findMany({
           where,
           orderBy: { startedAt: 'desc' },
           skip: (page - 1) * pageSize,
           take: pageSize,
         }),
         this.prisma.workflowExecution.count({ where }),
       ])

       return {
         items: executions,
         total,
         page,
         pageSize,
         totalPages: Math.ceil(total / pageSize),
       }
     }
   }
   ```

4. **Controller 路由**：

   ```ts
   @Controller('apps/:id/executions')
   export class ExecutionController {
     constructor(private readonly executionService: ExecutionService) {}

     @Get()
     findAll(
       @Headers('x-user-id') userId: string,
       @Param('id') appId: string,
       @Query() query: QueryExecutionDto,
     ) {
       return this.executionService.findExecutions(userId, appId, query)
     }
   }
   ```

### ⚠️ 踩坑点

- **索引设计**：`WorkflowExecution` 表上有 `@@index([status])` 和 `@@index([startedAt])`，分别加速状态筛选和时间倒序查询。这是两个独立的查询模式，不建联合索引——如果后续发现 90% 的查询都是 `status=ERROR + ORDER BY startedAt DESC`，再建联合索引也来得及。
- **分页方式**：当前用 offset-based（`skip` + `take`），数据量不大时足够。如果执行记录超过 10 万条，offset 分页会变慢，届时考虑 cursor-based 分页。
- **`pageSize` 上限**：miaoma 中限制了 `Math.min(100, Math.max(1, pageSize))`，防止请求过大页码。建议在 Service 中做同样保护。
- **查询的是 `WorkflowExecution`**（编辑器测试执行），不是 `AppExecution`（API 调用执行）。两者数据模型相似但关联不同：`WorkflowExecution.appId` → App，`AppExecution.publishedAppId` → PublishedApp。

### 参考源码

- `miaoma-aiflow/apps/workflow/app/api/apps/[id]/executions/route.ts`（查询 `AppExecution`，本项目查询 `WorkflowExecution`，逻辑类似）

---

## 4.5 PrismaService 连接池显式配置

### 目标

在 `PrismaService` 构造函数中为 `pg.Pool` 显式设置 `max`（连接池上限），补齐面试 claim 10。

### 关键步骤

1. **修改 `src/prisma/prisma.service.ts`**：

   ```ts
   // 当前代码
   const pool = new Pool({ connectionString })

   // 改为
   const pool = new Pool({
     connectionString,
     max: 10, // 显式设置连接池上限
   })
   ```

2. **可选：从环境变量读取**：

   ```ts
   const maxConnections = parseInt(process.env.DATABASE_MAX_CONNECTIONS || '10', 10)
   const pool = new Pool({
     connectionString,
     max: maxConnections,
   })
   ```

### ⚠️ 踩坑点

- **为什么显式设置 `max`**：pg Pool 默认 `max` 就是 10，但"默认值"和"显式配置"在面试中是不同的。面试官会问"你设了多少"——如果回答"默认的"，会被追问"默认是多少？你有没有主动评估过？"。显式设置 `max: 10` 并能解释原因，比依赖默认值更有说服力。
- **`max` 的合理值**：本地开发 10 足够；生产环境取决于数据库实例规格（PostgreSQL 默认 `max_connections=100`，应用连接池一般设为 `max_connections / 服务实例数 - 余量`）。
- **NestJS 生命周期**：`onModuleDestroy` 中调用 `pool.end()` 确保连接池关闭，避免内存泄漏。当前代码已实现。

### 参考源码

- 当前 `src/prisma/prisma.service.ts`（需修改）
- pg Pool 文档：[node-postgres Pool](https://node-postgres.com/apis/pool)

---

## 4.6 第二次 migration（演示 schema 演进）

### 目标

通过一次实际的 schema 变更，演示 Prisma Migrate 的完整流程，补齐面试 claim 6（migrate 流程）。

### 关键步骤

1. **修改 `schema.prisma`**（加一个字段，比如给 App 加 `lastRunAt`）：

   ```prisma
   model App {
     // ... 现有字段
     lastRunAt DateTime? // 新增：最后执行时间
     // ...
   }
   ```

2. **生成并执行 migration**：

   ```bash
   pnpm --filter api-server exec prisma migrate dev --name add-app-last-run-at
   ```

   Prisma 会：
   - 检测 schema 变更
   - 生成 SQL migration 文件（`prisma/migrations/<timestamp>_add_app_last_run_at/migration.sql`）
   - 执行迁移到数据库
   - 自动调用 `prisma generate` 更新客户端类型

3. **验证 migration 文件**：

   ```bash
   cat prisma/migrations/*_add-app-last-run-at/migration.sql
   # 应看到 ALTER TABLE "apps" ADD COLUMN "last_run_at" TIMESTAMP;
   ```

4. **提交 migration 文件到 git**：

   ```bash
   git add prisma/migrations/
   git commit -m "feat: add app last_run_at column"
   ```

### ⚠️ 踩坑点

- **migration 文件必须提交到 git**：`prisma/migrations/` 是版本控制的一部分，团队成员拉代码后跑 `prisma migrate deploy` 同步 schema。
- **`migrate dev` vs `migrate deploy`**：`migrate dev` 用于开发（生成 + 执行 + generate），`migrate deploy` 用于生产（只执行未应用的 migration，不生成新文件）。
- **`migrate reset`**：开发阶段如果 schema 改动大，可以用 `prisma migrate reset`（会清空数据 + 重新执行所有 migration + seed）。⚠️ 会丢数据。
- **不要手动改 migration 文件**：如果 migration 有问题，用 `prisma migrate resolve` 标记为已解决/回滚，不要手动编辑 SQL。

### 参考源码

- 当前 `prisma/migrations/20260531164001_init/migration.sql`（第一次 migration 参考）

---

## 4.7 API Key 管理

### 目标

在 `apps/api-server/src/modules/api-key/` 下实现 API Key 的生成、列表（脱敏）、撤销，为 4.8 Guard 提供数据基础。

> 📌 本节 + 4.8 + 4.9 对应 ADR-012 合并进 Phase4 的原 miaoma Phase9 内容（9.2/9.3/9.4）。

### 关键步骤

1. **创建文件结构**：

   ```
   src/modules/api-key/
   ├── api-key.module.ts
   ├── api-key.controller.ts
   ├── api-key.service.ts
   ├── api-key.util.ts        # 生成 key 的工具函数
   └── dto/
       └── create-api-key.dto.ts
   ```

2. **Key 生成工具**：

   ```ts
   // api-key.util.ts
   import { randomBytes } from 'crypto'

   export function generateApiKey(): string {
     return `sk-${randomBytes(24).toString('hex')}`
   }

   // 脱敏展示：前 7 位 + ... + 后 4 位
   export function generateKeyPrefix(key: string): string {
     return `${key.slice(0, 7)}...${key.slice(-4)}`
   }
   ```

3. **DTO**：

   ```ts
   import { IsString, IsOptional, IsISO8601, MaxLength } from 'class-validator'

   export class CreateApiKeyDto {
     @IsString()
     @MaxLength(50)
     name: string

     @IsISO8601()
     @IsOptional()
     expiresAt?: string
   }
   ```

4. **Service 核心逻辑**：

   ```ts
   @Injectable()
   export class ApiKeyService {
     constructor(private readonly prisma: PrismaService) {}

     async findAll(userId: string, appId: string) {
       await this.verifyAppOwnership(userId, appId)
       const keys = await this.prisma.apiKey.findMany({
         where: { appId },
         orderBy: { createdAt: 'desc' },
       })
       // 脱敏：列表接口不返回完整 key，只返回 keyPrefix
       return keys.map(({ key, ...rest }) => rest)
     }

     async create(userId: string, appId: string, dto: CreateApiKeyDto) {
       await this.verifyAppOwnership(userId, appId)
       const key = generateApiKey()
       const keyPrefix = generateKeyPrefix(key)

       const apiKey = await this.prisma.apiKey.create({
         data: {
           name: dto.name,
           key,
           keyPrefix,
           appId,
           expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
         },
       })

       // 创建时返回完整 key —— 这是唯一一次机会，之后接口一律脱敏
       return apiKey
     }

     async revoke(userId: string, appId: string, keyId: string) {
       await this.verifyAppOwnership(userId, appId)
       const key = await this.prisma.apiKey.findFirst({ where: { id: keyId, appId } })
       if (!key) throw new NotFoundException('API Key 不存在')
       // 软禁用而非硬删除：保留使用统计和审计记录
       return this.prisma.apiKey.update({ where: { id: keyId }, data: { isActive: false } })
     }

     private async verifyAppOwnership(userId: string, appId: string) {
       const app = await this.prisma.app.findFirst({ where: { id: appId, userId, isDeleted: false } })
       if (!app) throw new NotFoundException('应用不存在')
     }
   }
   ```

5. **Controller**：

   ```ts
   @Controller('apps/:id/api-keys')
   export class ApiKeyController {
     constructor(private readonly apiKeyService: ApiKeyService) {}

     @Get()
     findAll(@Headers('x-user-id') userId: string, @Param('id') appId: string) {
       return this.apiKeyService.findAll(userId, appId)
     }

     @Post()
     create(@Headers('x-user-id') userId: string, @Param('id') appId: string, @Body() dto: CreateApiKeyDto) {
       return this.apiKeyService.create(userId, appId, dto)
     }

     @Delete(':keyId')
     revoke(
       @Headers('x-user-id') userId: string,
       @Param('id') appId: string,
       @Param('keyId') keyId: string,
     ) {
       return this.apiKeyService.revoke(userId, appId, keyId)
     }
   }
   ```

### ⚠️ 踩坑点

- **完整 Key 只在创建时返回一次**：列表接口（`findAll`）必须脱敏，用解构 `const { key, ...rest } = apiKey` 剔除完整 key 字段，只暴露 `keyPrefix`。这是安全基本要求——数据库泄露时至少不会在应用日志/前端网络请求里再泄露一次明文 Key。
- **撤销用软禁用不用硬删除**：`isActive: false` 而不是 `prisma.apiKey.delete()`。硬删除会丢失 `usageCount` / `lastUsedAt` 审计数据，且 4.9 的 Guard 检查 `isActive` 后可以立即拒绝该 Key，效果等同于删除。
- **`appId` 归属校验前置**：所有操作先 `verifyAppOwnership`，防止用户 A 操作用户 B 的 App 下的 Key（横向越权）。

### 参考源码

- `miaoma-aiflow/apps/workflow/app/api/apps/[id]/api-keys/route.ts`（GET 列表 + POST 创建）

---

## 4.8 API Key Guard（鉴权中间件）

### 目标

实现 NestJS Guard，拦截携带 `Authorization: Bearer sk-xxx` 的外部请求，校验 API Key 有效性，并将应用信息注入请求上下文。

### 关键步骤

1. **创建文件**：`src/common/guards/api-key.guard.ts`

2. **扩展 Express Request 类型**：

   ```ts
   export interface AppContext {
     id: string
     name: string
     activePublishedId: string | null
   }

   export interface ApiKeyContext {
     id: string
     name: string
   }

   declare global {
     namespace Express {
       interface Request {
         appContext?: AppContext
         apiKeyContext?: ApiKeyContext
       }
     }
   }
   ```

3. **Guard 核心逻辑**：

   ```ts
   @Injectable()
   export class ApiKeyGuard implements CanActivate {
     constructor(private readonly prisma: PrismaService) {}

     async canActivate(context: ExecutionContext): Promise<boolean> {
       const request = context.switchToHttp().getRequest<Request>()
       const authHeader = request.headers.authorization

       if (!authHeader) {
         throw new UnauthorizedException('缺少 API Key，请在 Authorization header 中提供 Bearer token')
       }

       const [type, token] = authHeader.split(' ')
       if (type !== 'Bearer' || !token) {
         throw new UnauthorizedException('Authorization 格式应为 Bearer <API_KEY>')
       }

       const apiKey = await this.prisma.apiKey.findUnique({
         where: { key: token },
         include: {
           app: {
             select: { id: true, name: true, isPublished: true, isDeleted: true, activePublishedId: true },
           },
         },
       })

       if (!apiKey) throw new UnauthorizedException('无效的 API Key')
       if (!apiKey.isActive) throw new UnauthorizedException('API Key 已禁用')
       if (apiKey.expiresAt && apiKey.expiresAt < new Date()) throw new UnauthorizedException('API Key 已过期')
       if (!apiKey.app || apiKey.app.isDeleted) throw new UnauthorizedException('应用不存在')
       if (!apiKey.app.isPublished) throw new UnauthorizedException('应用尚未发布，请先发布应用')

       // 异步更新使用统计，不阻塞请求主流程
       this.prisma.apiKey
         .update({
           where: { id: apiKey.id },
           data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
         })
         .catch(() => {
           // 统计更新失败不影响主请求
         })

       request.appContext = {
         id: apiKey.app.id,
         name: apiKey.app.name,
         activePublishedId: apiKey.app.activePublishedId,
       }
       request.apiKeyContext = { id: apiKey.id, name: apiKey.name }

       return true
     }
   }
   ```

4. **在需要外部鉴权的 Controller 上使用**：

   ```ts
   @Controller('v1/apps')
   @UseGuards(ApiKeyGuard)
   export class WorkflowRunController { ... }
   ```

### ⚠️ 踩坑点

- **两套鉴权体系不要混用**：`x-user-id`（4.2~4.7 用，模拟用户身份，后续换 JWT）用于"用户管理自己的资源"；`ApiKeyGuard`（本节，Bearer token）用于"外部系统调用已发布应用"。两者语义不同，`v1/apps/run` 只用 Guard，不需要 `x-user-id`。
- **校验顺序有讲究**：先查 Key 是否存在 → 是否启用 → 是否过期 → App 是否存在/未删除 → App 是否已发布。顺序错了会导致错误信息误导（比如 App 已发布但 Key 过期，应该报"Key 已过期"而不是"App 未发布"）。
- **使用统计异步更新**：`this.prisma.apiKey.update(...)` 不 `await`，避免每次调用都多等一次数据库写入的 RTT；但必须 `.catch()` 兜底，否则会产生 unhandled promise rejection。
- **`declare global` 类型扩展**：这段代码扩展了 Express 的 `Request` 类型，需确保该文件被 `tsconfig.json` 的 `include` 覆盖，否则其他文件里 `request.appContext` 会报类型错误。

### 参考源码

- `miaoma-aiflow/apps/api-server/src/common/guards/api-key.guard.ts`（完整实现，直接可参考迁移）

---

## 4.9 外部执行接口（占位版）

### 目标

实现 `POST /api/v1/apps/run`，验证 API Key 鉴权链路完整可用，并真实创建 `AppExecution` 记录；但**不真正调用 AI Engine 执行工作流**（依赖 Phase 3.11，当前暂停），执行结果直接标记为占位状态。

> ⚠️ **这是本节与 miaoma 的核心差异**：miaoma 这里会调用 `ai-engine` 的 `WorkflowEngine.execute()` 真实跑工作流。本项目因 Phase 3.11 未完成，先做"骨架版"——鉴权、DTO 校验、执行记录写入全部到位，只是中间的"真正执行"用占位逻辑代替。等 Phase 3.11 完成后，只需替换 Service 内部这一小段调用，Controller / Guard / DTO 都不需要改动。

### 关键步骤

1. **创建文件**：

   ```
   src/modules/workflow-run/
   ├── workflow-run.module.ts
   ├── workflow-run.controller.ts
   ├── workflow-run.service.ts
   └── dto/
       └── run-workflow.dto.ts
   ```

2. **DTO**：

   ```ts
   import { IsObject, IsOptional, IsBoolean } from 'class-validator'

   export class RunWorkflowDto {
     @IsObject()
     @IsOptional()
     inputs?: Record<string, unknown>

     // SSE 流式模式，占位阶段暂不支持，Phase 3.11 完成后再实现
     @IsBoolean()
     @IsOptional()
     stream?: boolean
   }
   ```

3. **Service 核心逻辑（占位实现）**：

   ```ts
   @Injectable()
   export class WorkflowRunService {
     constructor(private readonly prisma: PrismaService) {}

     async run(appContext: AppContext, apiKeyContext: ApiKeyContext, dto: RunWorkflowDto) {
       const executionId = randomUUID()

       // 1. 创建执行记录（RUNNING）
       const execution = await this.prisma.appExecution.create({
         data: {
           executionId,
           status: 'RUNNING',
           inputs: dto.inputs,
           publishedAppId: appContext.activePublishedId!,
           apiKeyId: apiKeyContext.id,
         },
       })

       // 2. ⚠️ 占位实现：真正的引擎调用（WorkflowEngine.execute）待 Phase 3.11 完成后接入
       //    当前直接标记为 ERROR，附带说明信息，保证 AppExecution 记录链路可验证
       const updated = await this.prisma.appExecution.update({
         where: { id: execution.id },
         data: {
           status: 'ERROR',
           error: 'AI Engine（Phase 3.11 引擎主循环）尚未实现，当前为占位执行',
           completedAt: new Date(),
         },
       })

       return {
         executionId: updated.executionId,
         status: updated.status,
         error: updated.error,
       }
     }
   }
   ```

4. **Controller**：

   ```ts
   @Controller('v1/apps')
   @UseGuards(ApiKeyGuard)
   export class WorkflowRunController {
     constructor(private readonly workflowRunService: WorkflowRunService) {}

     @Post('run')
     run(@Req() req: Request, @Body() dto: RunWorkflowDto) {
       return this.workflowRunService.run(req.appContext!, req.apiKeyContext!, dto)
     }
   }
   ```

### ⚠️ 踩坑点

- **为什么不是简单返回 501**：直接抛 `NotImplementedException` 能验证 Guard 生效，但验证不了 `AppExecution` 记录写入、`executionId` 生成、状态流转这些数据库层面的能力。占位实现先把 `RUNNING → ERROR` 的状态流转跑通，Phase 3.11 回补时只需把"标记 ERROR"替换成"调用引擎、写回真实 outputs"，验证路径不变。
- **`activePublishedId!` 的非空断言**：Guard 已经校验过 `apiKey.app.isPublished === true`，理论上 `activePublishedId` 此时一定有值（发布时事务保证同时写入）。用非空断言是合理的，但如果不放心可以加一层防御性判断。
- **`stream` 参数占位不处理**：SSE 流式执行依赖真实的引擎逐节点回调（`onNodeStart` / `onNodeEnd`），Phase 3.11 完成后才能实现，当前 DTO 保留字段但 Service 不处理，避免字段以后要重新设计。
- **回补时的验证方式**：Phase 3.11 完成后，重新跑一遍本节末尾的 curl 验证，`status` 应该从 `ERROR`（占位说明）变为 `SUCCESS`/真实 `outputs`。

### 参考源码

- `miaoma-aiflow/apps/api-server/src/modules/workflow/workflow.controller.ts`（真实执行版本，含 SSE 流式，Phase 3.11 完成后参考此文件补全）

---

## 最终验证清单

完成所有步骤后，执行以下验证：

```bash
# 0. 确保 PostgreSQL 运行
cd docker && docker compose up -d && cd ..

# 1. 重新 generate（确保类型最新）
pnpm --filter api-server exec prisma generate

# 2. 执行 migration
pnpm --filter api-server exec prisma migrate dev

# 3. 执行 seed
pnpm --filter api-server exec prisma db seed

# 4. 启动 API 服务
pnpm --filter api-server dev

# 5. 测试 App CRUD
# 获取 demo 用户 ID（从 Prisma Studio 或 seed 输出）
USER_ID="<seed 输出的 user.id>"

# 创建应用
curl -X POST http://localhost:3100/api/apps \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"name": "测试应用", "type": "WORKFLOW"}'

# 查询应用列表
curl http://localhost:3100/api/apps?page=1&pageSize=10 \
  -H "x-user-id: $USER_ID"

# 6. 测试发布接口
APP_ID="<上一步创建的 app.id>"
curl -X POST http://localhost:3100/api/apps/$APP_ID/publish \
  -H "x-user-id: $USER_ID"

# 7. 测试执行历史查询
curl http://localhost:3100/api/apps/$APP_ID/executions?status=all&page=1 \
  -H "x-user-id: $USER_ID"

# 8. 创建 API Key
curl -X POST http://localhost:3100/api/apps/$APP_ID/api-keys \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"name": "测试 Key"}'
# 记下响应中的完整 key（唯一一次显示机会）

# 9. 列表查询 API Key（应脱敏，只显示 keyPrefix）
curl http://localhost:3100/api/apps/$APP_ID/api-keys \
  -H "x-user-id: $USER_ID"

# 10. 用 API Key 调用外部执行接口（占位版，预期 status=ERROR + 占位说明）
API_KEY="<第8步返回的完整 key>"
curl -X POST http://localhost:3100/api/v1/apps/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"inputs": {"topic": "测试"}}'

# 11. 验证鉴权失败场景（错误 Key 应返回 401）
curl -X POST http://localhost:3100/api/v1/apps/run \
  -H "Authorization: Bearer sk-invalid-key" \
  -d '{}'
```

---

## 文件结构（完成后）

```
apps/api-server/
├── prisma/
│   ├── schema.prisma              # 数据模型（新增 lastRunAt 字段）
│   ├── seed.ts                    # ✨ 新增：seed 脚本（含 WorkflowExecution 测试数据）
│   └── migrations/
│       ├── 20260531164001_init/   # 第一次 migration
│       └── <timestamp>_add-app-last-run-at/  # ✨ 新增：第二次 migration
├── package.json                   # 新增 prisma.seed 配置
└── src/
    ├── common/
    │   └── guards/
    │       └── api-key.guard.ts    # ✨ 新增：外部调用鉴权 Guard
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts      # 修改：显式 max 配置
    └── modules/                   # ✨ 新增业务模块
        ├── app/
        │   ├── app.module.ts
        │   ├── app.controller.ts
        │   ├── app.service.ts      # 含 publish 方法（事务）
        │   └── dto/
        │       ├── create-app.dto.ts
        │       ├── update-app.dto.ts
        │       └── query-app.dto.ts
        ├── execution/
        │   ├── execution.module.ts
        │   ├── execution.controller.ts
        │   ├── execution.service.ts
        │   └── dto/
        │       └── query-execution.dto.ts
        ├── api-key/                # ✨ 新增：API Key 管理
        │   ├── api-key.module.ts
        │   ├── api-key.controller.ts
        │   ├── api-key.service.ts
        │   ├── api-key.util.ts
        │   └── dto/
        │       └── create-api-key.dto.ts
        └── workflow-run/           # ✨ 新增：外部执行接口（占位版）
            ├── workflow-run.module.ts
            ├── workflow-run.controller.ts
            ├── workflow-run.service.ts
            └── dto/
                └── run-workflow.dto.ts
```

---

## 面试亮点

Phase 4 完成后，可以在面试中重点展开的技术点：

1. **编辑态/发布态分表**：Workflow（编辑态）和 PublishedApp（发布快照）拆分，避免读写竞争
2. **事务保证一致性**：发布操作用 `$transaction` 交互式 API，快照复制 + 激活版本更新原子完成
3. **索引设计**：`@@index([status])` + `@@index([startedAt])` 分别对应状态筛选和时间倒序查询
4. **连接池管理**：Prisma 7 + `@prisma/adapter-pg` + `pg.Pool` 显式 `max` 配置
5. **migrate 流程**：从 `init` 到 `add-app-last-run-at`，演示 schema 演进
6. **分页查询**：`findMany` + `count` 并行，offset-based 分页，`Promise.all` 减少 RTT
7. **API Key 安全设计**：完整 Key 仅创建时返回一次、列表脱敏、撤销用软禁用保留审计
8. **Guard 模式鉴权**：`CanActivate` 实现外部调用鉴权，校验顺序设计（存在性→启用→过期→归属→发布状态）
9. **架构演进意识**：外部执行接口先做"骨架+占位"版本，明确标注依赖项（Phase 3.11），避免为了赶进度写出无法验证的代码
