# Phase 2：后端基础设施（NestJS + Prisma）

> **预计耗时**：2-3 天
> **前置条件**：Phase 1 已完成（turbo、eslint、tsconfig 均就绪）
> **验证目标**：API 服务启动在 3100 端口，`GET /api` 返回统一格式响应

---

## 步骤总览

| 步骤 | 任务                                | 依赖 DB | 难度   |
| ---- | ----------------------------------- | ------- | ------ |
| 2.1  | 初始化 NestJS 项目                  | ❌      | ⭐     |
| 2.2  | 全局配置（ConfigModule + 路由前缀） | ❌      | ⭐     |
| 2.3  | 全局 ValidationPipe                 | ❌      | ⭐⭐   |
| 2.4  | 全局异常过滤器                      | ❌      | ⭐⭐   |
| 2.5  | 全局响应拦截器                      | ❌      | ⭐     |
| 2.6  | Prisma 7 集成（PrismaModule）       | ✅      | ⭐⭐⭐ |
| 2.7  | 定义数据模型（Schema）              | ✅      | ⭐⭐   |
| 2.8  | 数据库迁移                          | ✅      | ⭐     |

---

## 2.1 初始化 NestJS 项目

### 目标

在 `apps/api-server/` 下创建一个最小可运行的 NestJS 应用。

### 关键步骤

1. **不要用 `nest new`**（它会创建独立 git 仓库），手动初始化：

   ```bash
   cd apps/api-server
   pnpm init
   ```

2. **安装依赖**（在 api-server 目录下）：

   ```bash
   # 运行时依赖
   pnpm add @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs

   # 开发依赖
   pnpm add -D @nestjs/cli @nestjs/schematics @types/express @types/node typescript
   ```

3. **创建文件结构**：

   ```
   apps/api-server/
   ├── src/
   │   ├── main.ts           # 入口
   │   └── app.module.ts     # 根模块
   ├── nest-cli.json
   ├── tsconfig.json         # NestJS 专用（不继承根目录的）
   ├── tsconfig.build.json
   └── package.json
   ```

4. **配置 scripts**：
   ```json
   {
     "scripts": {
       "dev": "nest start --watch",
       "build": "nest build",
       "start:prod": "node dist/main",
       "typecheck": "tsc --noEmit"
     }
   }
   ```

### ⚠️ 踩坑点

- **tsconfig.json 不继承根目录的**：NestJS 需要 `emitDecoratorMetadata: true` + `experimentalDecorators: true`，这和根目录的 strict 配置冲突。直接参考源码的 `apps/api-server/tsconfig.json`，独立配置。
- **module 用 commonjs**：NestJS 目前仍然基于 CommonJS 运行（虽然源码是 TS），`"module": "commonjs"` 是必须的。
- **根目录 `package.json` 的 `"type": "module"` 不影响子包**：pnpm workspace 中每个子包有自己的 `package.json`，模块系统独立。

### 验证

```bash
pnpm --filter api-server dev
# 应该看到 NestJS 启动日志
```

---

## 2.2 全局配置

### 目标

配置环境变量读取 + 全局路由前缀 `/api` + CORS。

### 关键步骤

1. **安装 `@nestjs/config`**：

   ```bash
   pnpm add @nestjs/config dotenv
   ```

2. **创建 `.env` 文件**（`apps/api-server/.env`）：

   ```env
   PORT=3100
   DATABASE_URL=postgresql://postgres:password@localhost:5433/zn_ai_engine
   NODE_ENV=development
   ```

3. **在 `app.module.ts` 中注册**：

   ```ts
   ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })
   ```

4. **在 `main.ts` 中设置**：
   ```ts
   app.setGlobalPrefix('api')
   app.enableCors({ origin: true, credentials: true })
   ```

### ⚠️ 踩坑点

- **`.env` 不要提交到 git**：确保 `.gitignore` 中有 `.env*` 规则（已配置）。
- **`isGlobal: true`**：让 ConfigService 在所有模块中可注入，不需要每个模块单独 import。

### 参考源码

- `miaoma-aiflow/apps/api-server/src/main.ts`（第 20-25 行）
- `miaoma-aiflow/apps/api-server/src/app.module.ts`（ConfigModule 部分）

---

## 2.3 全局 ValidationPipe

### 目标

自动校验请求体（DTO），拒绝非法字段。

### 关键步骤

1. **安装**：

   ```bash
   pnpm add class-validator class-transformer
   ```

2. **在 `main.ts` 中注册**：
   ```ts
   app.useGlobalPipes(
     new ValidationPipe({
       whitelist: true, // 自动移除 DTO 中未定义的属性
       forbidNonWhitelisted: true, // 存在未定义属性时直接报错
       transform: true, // 自动类型转换（string → number 等）
       transformOptions: {
         enableImplicitConversion: true,
       },
     }),
   )
   ```

### ⚠️ 踩坑点

- **`whitelist` vs `forbidNonWhitelisted`**：
  - `whitelist: true` 只是静默移除多余字段
  - `forbidNonWhitelisted: true` 会直接抛 400 错误
  - 两者配合使用：既安全又有明确的错误提示
- **`transform: true` 的副作用**：会把 query 参数的 string 自动转为 number/boolean，大多数情况下是好事，但要注意 `"0"` 会变成 `0`（falsy → truthy 语义变化）。

### 验证

创建一个测试 DTO + Controller，发送带有多余字段的请求，应该返回 400。

---

## 2.4 全局异常过滤器

### 目标

统一所有错误响应格式为 `{ code, message, details? }`。

### 关键步骤

1. **创建文件**：`src/common/filters/http-exception.filter.ts`

2. **核心逻辑**：
   - 捕获所有异常（`@Catch()` 无参数 = 捕获一切）
   - `HttpException` → 提取 status + response
   - 普通 `Error` → 500 + 开发环境显示原始消息，生产环境隐藏
   - 已发送响应头时跳过（SSE 场景）

3. **在 `main.ts` 中注册**：
   ```ts
   app.useGlobalFilters(new GlobalExceptionFilter())
   ```

### ⚠️ 踩坑点

- **`response.headersSent` 检查**：如果你后续实现 SSE 流式响应（工作流执行进度推送），必须加这个判断，否则会报 "Cannot set headers after they are sent"。
- **错误格式设计**：源码用的是 `{ code: string, message: string }`（不是 `{ code: number }`），`code` 是语义化字符串如 `"UNAUTHORIZED"`、`"VALIDATION_ERROR"`，前端可以据此做 i18n。
- **开发 vs 生产**：`NODE_ENV === 'development'` 时暴露原始错误信息，生产环境统一返回"服务器内部错误"。

### 参考源码

- `miaoma-aiflow/apps/api-server/src/common/filters/http-exception.filter.ts`（完整实现 90 行）

---

## 2.5 全局响应拦截器

### 目标

统一成功响应格式为 `{ success: true, data: T }`。

### 关键步骤

1. **创建文件**：`src/common/interceptors/transform.interceptor.ts`

2. **核心逻辑**（非常简洁，~15 行）：

   ```ts
   @Injectable()
   export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
     intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
       return next.handle().pipe(map(data => ({ success: true as const, data })))
     }
   }
   ```

3. **在 `main.ts` 中注册**：
   ```ts
   app.useGlobalInterceptors(new TransformInterceptor())
   ```

### ⚠️ 踩坑点

- **SSE / 流式响应不经过拦截器**：如果 Controller 直接操作 `Response` 对象（`@Res()`），拦截器不会生效。这是 NestJS 的设计，不是 bug。
- **与异常过滤器的配合**：拦截器只处理成功响应，异常由过滤器处理。两者格式要统一设计：
  - 成功：`{ success: true, data }`
  - 失败：`{ code: "ERROR_CODE", message: "..." }`

### 参考源码

- `miaoma-aiflow/apps/api-server/src/common/interceptors/transform.interceptor.ts`（28 行）

---

## 2.6 Prisma 7 集成

### 目标

创建全局 PrismaModule，使用 `@prisma/adapter-pg` 连接 PostgreSQL。

### 前置条件

⚠️ **此步骤需要 PostgreSQL 运行**。如果还没配置 Docker Compose，先完成数据库部署。

### 关键步骤

1. **安装依赖**：

   ```bash
   pnpm add @prisma/client @prisma/adapter-pg pg prisma
   pnpm add -D @types/pg
   ```

2. **创建文件结构**：

   ```
   src/prisma/
   ├── prisma.module.ts    # @Global() 模块
   └── prisma.service.ts   # 继承 PrismaClient
   ```

3. **PrismaService 核心逻辑**：
   - 继承 `PrismaClient`
   - 构造函数中创建 `pg.Pool` → `PrismaPg` adapter → 传入 `super()`
   - 实现 `OnModuleInit`（连接）和 `OnModuleDestroy`（断开 + pool.end）

4. **PrismaModule**：
   - `@Global()` 装饰器 → 全局可用
   - `providers: [PrismaService]`
   - `exports: [PrismaService]`

5. **在 `app.module.ts` 中 import**：
   ```ts
   imports: [ConfigModule.forRoot(...), PrismaModule, ...]
   ```

### ⚠️ 踩坑点

- **Prisma 7 的 `@prisma/adapter-pg`**：这是 Prisma 7 的新特性（Driver Adapters），不再使用内置的连接池，而是用原生 `pg` 的 Pool。好处是更灵活，坏处是需要手动管理 Pool 生命周期。
- **`generator client` 的 `output` 路径**：源码输出到 `src/generated/prisma/`，这样 import 路径更短。注意 `.gitignore` 中要忽略 `generated/` 目录（它由 `prisma generate` 自动生成）。
- **`prisma.config.ts`**：Prisma 7 新增的配置文件，用于指定 schema 路径等。参考源码 `apps/api-server/prisma.config.ts`。
- **连接字符串中的端口**：Docker Compose 映射的端口（如 5433）和容器内部端口（5432）不同，确保 `DATABASE_URL` 用的是映射端口。

### 参考源码

- `miaoma-aiflow/apps/api-server/src/prisma/prisma.service.ts`（39 行）
- `miaoma-aiflow/apps/api-server/src/prisma/prisma.module.ts`（17 行）

---

## 2.7 定义数据模型

### 目标

在 `prisma/schema.prisma` 中定义 9 个 Model + 关系 + 索引。

### 关键步骤

1. **创建 `apps/api-server/prisma/schema.prisma`**

2. **按依赖顺序定义 Model**：

   ```
   User → App → Workflow
                → PublishedApp → AppExecution
                → ApiKey → AppExecution
                → WorkflowExecution
   ```

3. **定义枚举**：
   - `ExecutionStatus`：RUNNING / SUCCESS / ERROR
   - `AppType`：WORKFLOW / CHATBOT / AGENT

### ⚠️ 踩坑点

- **自引用关系（App ↔ PublishedApp）**：`App.activePublishedId` 指向 `PublishedApp.id`，同时 `PublishedApp.appId` 指向 `App.id`。这是**双向关联**，Prisma 需要用 `@relation("RelationName")` 消歧义。

  ```prisma
  // App 中
  activePublished  PublishedApp? @relation("ActivePublished", fields: [activePublishedId], references: [id], onDelete: NoAction, onUpdate: NoAction)

  // PublishedApp 中
  activeApps  App[] @relation("ActivePublished")
  ```

- **`onDelete: NoAction`**：自引用关系不能用 `Cascade`，否则删除时会死循环。
- **`@@map("table_name")`**：Model 名用 PascalCase，表名用 snake_case，通过 `@@map` 映射。
- **`Json` 类型**：`nodes`、`edges`、`nodeTraces` 等字段用 `Json` 类型存储，灵活但失去了数据库层面的类型校验。

### 参考源码

- `miaoma-aiflow/apps/api-server/prisma/schema.prisma`（完整 244 行，9 个 Model）

---

## 2.8 数据库迁移

### 目标

执行 `prisma migrate dev` 生成迁移文件并同步数据库。

### 关键步骤

1. **确保 PostgreSQL 运行且 `DATABASE_URL` 正确**

2. **生成 Prisma Client**：

   ```bash
   pnpm --filter api-server exec prisma generate
   ```

3. **执行迁移**：

   ```bash
   pnpm --filter api-server exec prisma migrate dev --name init
   ```

4. **验证**：
   ```bash
   pnpm --filter api-server exec prisma studio
   # 打开 Prisma Studio 查看表结构
   ```

### ⚠️ 踩坑点

- **首次迁移命名**：用 `--name init`，后续迁移用语义化名称如 `--name add-knowledge-base`。
- **迁移文件要提交到 git**：`prisma/migrations/` 目录是版本控制的一部分。
- **`prisma generate` vs `prisma migrate`**：
  - `generate`：根据 schema 生成 TypeScript 客户端代码（到 `src/generated/prisma/`）
  - `migrate dev`：生成 SQL 迁移文件 + 执行迁移 + 自动调用 generate
- **重置数据库**：开发阶段如果 schema 改动大，可以用 `prisma migrate reset`（会清空数据）。

---

## 最终验证清单

完成所有步骤后，执行以下验证：

```bash
# 1. turbo dev 启动（从根目录）
pnpm dev

# 2. 健康检查
curl http://localhost:3100/api
# 期望：{ "success": true, "data": ... } 或 404（无路由但格式统一）

# 3. 发送非法请求测试 ValidationPipe
curl -X POST http://localhost:3100/api/xxx -H "Content-Type: application/json" -d '{"invalid": true}'
# 期望：{ "code": "NOT_FOUND", "message": "..." }

# 4. Prisma Studio 查看表
pnpm --filter api-server exec prisma studio
```

---

## 文件结构（完成后）

```
apps/api-server/
├── .env                    # 环境变量（不提交）
├── nest-cli.json
├── package.json
├── prisma/
│   ├── schema.prisma       # 数据模型定义
│   └── migrations/         # 迁移文件（提交）
├── prisma.config.ts        # Prisma 7 配置
├── tsconfig.json           # NestJS 专用
├── tsconfig.build.json
└── src/
    ├── main.ts             # 入口（全局配置注册）
    ├── app.module.ts       # 根模块
    ├── common/
    │   ├── filters/
    │   │   └── http-exception.filter.ts
    │   └── interceptors/
    │       └── transform.interceptor.ts
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── modules/            # 业务模块（Phase 3+ 再填充）
    └── generated/          # Prisma 生成（不提交）
        └── prisma/
```
