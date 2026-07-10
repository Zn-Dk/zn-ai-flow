# PostgreSQL 面试准备 — zn-ai-flow 作战手册

> **用途**：面试前速查 + 面试中应答。每条 resume claim 都能落实到具体代码位置。
> **维护规则**：Phase 4 实施后逐条更新"代码现状"列，P0 未完成前标记为 ⚠️。

---

## 一、简历 Claim → 代码定位速查表

| #   | 简历表述                                | 代码证据                                                           | 当前状态      | 面试风险    |
| --- | --------------------------------------- | ------------------------------------------------------------------ | ------------- | ----------- |
| 1   | 编辑态/发布态分表数据模型               | `schema.prisma` Workflow vs PublishedApp 两表拆分                  | ✅ 已可展示   | 低          |
| 2   | @@unique 版本约束                       | `schema.prisma` L155: `@@unique([appId, version])`                 | ✅ 已可展示   | 低          |
| 3   | 执行历史索引设计                        | `schema.prisma` `@@index([status])` `@@index([startedAt])`         | ✅ 已可展示   | 低          |
| 4   | Prisma 7 + @prisma/adapter-pg + pg Pool | `PrismaService` 构造函数                                           | ✅ 已可展示   | 中—追问细节 |
| 5   | Docker 本地环境                         | `docker/docker-compose.yaml`                                       | ✅ 已可展示   | 低          |
| 6   | migrate 流程                            | `prisma/migrations/20260531164001_init/`                           | ✅ 已可展示   | 中—追问演进 |
| 7   | seed 流程                               | 无 seed 文件                                                       | ⚠️ 待 P0 实施 | **高**      |
| 8   | 分页/筛选/排序查询                      | Phase 4 App Controller 未实施                                      | ⚠️ 待 P0 实施 | **高**      |
| 9   | 事务（发布版本）                        | Phase 4 未实施                                                     | ⚠️ 待 P0 实施 | **高**      |
| 10  | 连接池上限配置                          | `PrismaService` 使用 `new Pool({ connectionString })` 未显式设 max | ⚠️ 待 P1 实施 | 中          |

> **面试策略**：如果面试在 P0 完成前发生——用 schema 文件展示设计思路，诚实说明"API 层正在迭代中，但数据模型和索引设计已经落地"。

---

## 二、逐条 Claim 深度展开

### Claim 1：编辑态/发布态分表数据模型

**代码定位**：`apps/api-server/prisma/schema.prisma`

**你在简历上写的**：

> 设计编辑态/发布态分表数据模型与 @@unique 版本约束

**面试可以讲的**：

> 工作流在编辑过程中节点和边会频繁变化，但如果线上调用也直接读这套数据，任何一次未完成的编辑都可能导致线上执行出问题。所以我把 Workflow（编辑态）和 PublishedApp（发布快照）拆成两张表。
>
> Workflow 存的是当前编辑中的配置，PublishedApp 是发布时从 Workflow 复制的完整快照。发布的动作是：复制当前 Workflow 的 nodes/edges 到 PublishedApp，版本号 +1，再更新 App.activePublishedId 指向新快照。
>
> 这个设计的好处是：(1) 编辑不影响线上，(2) 每次发布都有历史快照可回滚，(3) 版本号用 @@unique([appId, version]) 保证同一个应用不会有重复版本。

**追问应对**：

- Q："为什么不直接在 Workflow 上加 isPublished 标记？"
  A：如果只标记不复制，一旦继续编辑 Workflow，线上实际执行的内容就变了——这就是读写竞争。快照是最彻底的隔离。

---

### Claim 2：@@unique 版本约束

**代码定位**：`schema.prisma` PublishedApp 模型，第 ~155 行

```prisma
model PublishedApp {
  // ...
  version     Int
  @@unique([appId, version]) // 同一应用的版本号唯一
}
```

**面试可以讲的**：

> PublishedApp 的版本号是应用级别的自增序列，不是全局的。`@@unique([appId, version])` 保证每个 App 下面的版本号不会重复。发布的时候如果两个请求同时操作同一个 App，数据库层面会拒绝重复版本号的插入——这比应用层加锁更可靠。

---

### Claim 3：执行历史索引设计

**代码定位**：`schema.prisma` WorkflowExecution 和 AppExecution 模型

```prisma
model WorkflowExecution {
  // ...
  status     ExecutionStatus
  startedAt  DateTime  @default(now())
  @@index([status])
  @@index([startedAt])
}
```

**面试可以讲的**：

> 索引不是随便加的。运营后台有两个核心查询：按状态筛选（看哪些失败了），按时间倒序（看最近的执行）。这两个查询路径就是索引的依据。
>
> 有人会问为什么不建联合索引 `@@index([status, startedAt])`——当前阶段我用的是单列索引，因为状态筛选和时间排序是两个独立的查询模式，不总是在同一个 WHERE 里同时出现。如果后续发现运营后台 90% 的查询都是 "status=ERROR + 按时间倒序"，那到时候再重建联合索引也来得及。索引是跟着查询模式走的，不是提前猜的。

---

### Claim 4：Prisma 7 + pg Pool 数据访问层

**代码定位**：`apps/api-server/src/prisma/prisma.service.ts`

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: [...] });
    this.pool = pool;
  }

  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); await this.pool.end(); }
}
```

**面试可以讲的**：

> Prisma 7 之后推荐通过 Driver Adapter 接入数据库，而不是 Prisma 自己管理连接。我用 @prisma/adapter-pg 把 pg 的原生连接池接进来，这样既能享受 Prisma 的类型安全和迁移工具，又保留了 pg Pool 对连接数的控制能力。
>
> 另外 Prisma 7 默认是 ESM 输出，但 NestJS 的模块系统当时还是 CJS 为主，这里需要配置生成 CJS 兼容的 client，踩过这个坑。

**追问应对**（P1 实施后）：

- Q："连接池上限设了多少？"
  A：默认 pg Pool 是 10，对本地开发足够了。如果上生产，会根据实例规格和并发量评估，一般 20-50 之间。

---

### Claim 5：Docker 本地 PostgreSQL 环境

**代码定位**：`docker/docker-compose.yaml`

```yaml
services:
  zn-ai-flow-postgresql:
    image: postgres:17-alpine
    ports:
      - '5433:5432'
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=zn_5873
      - POSTGRES_DB=zn_ai_engine
    volumes:
      - ./postgresql_data:/var/lib/postgresql/data
```

**面试可以讲的**：

> 本地开发用 docker-compose 起 PostgreSQL 17，端口映射到 5433 避免和宿主机已有的 PG 冲突。数据通过 volume 持久化，重启容器数据不丢。初始化流程是：`docker compose up -d` → `prisma generate` → `prisma migrate deploy` → `prisma db seed`，一条链下来就能跑。

---

### Claim 6：migrate 流程

**代码定位**：`apps/api-server/prisma/migrations/20260531164001_init/migration.sql`

**面试可以讲的**：

> 数据库变更走 Prisma Migrate：修改 schema.prisma → `prisma migrate dev --name <描述>` → 自动生成 SQL migration 文件 → 提交到 Git。团队成员拉代码后跑 `prisma migrate deploy` 就能同步 schema。
>
> 当前完成了初始 migration（建所有表），后续 Schema 有变更时会产生第二个 migration，记录演进过程而不是覆盖式修改。

---

### Claim 7：seed 流程（⚠️ 待 P0 实施）

**目标代码位置**：`apps/api-server/prisma/seed.ts`

**面试可讲的话术（实施后）**：

> seed 脚本初始化一个 demo 用户 + 示例应用 + 示例工作流，方便任何接手项目的人一行命令就能看到完整数据链路。Prisma 的 seed 是通过 `package.json` 里的 `"prisma": { "seed": "ts-node prisma/seed.ts" }` 配置的，跑 `prisma db seed` 即可。

---

### Claim 8：分页/筛选查询（⚠️ 待 P0 实施）

**目标代码位置**：`apps/api-server/src/modules/execution/execution.service.ts`

**面试可讲的话术（实施后）**：

> 执行历史列表接口支持三个参数：status（状态筛选）、page/pageSize（分页）、orderBy（按 startedAt 倒序）。Prisma 的 `findMany` + `skip` + `take` + `where` + `orderBy` 一行链式调用就能覆盖。翻页用的是 offset-based，数据量不大时足够；如果以后记录量上来了再考虑 cursor-based。

---

### Claim 9：事务（⚠️ 待 P0 实施）

**目标代码位置**：`apps/api-server/src/modules/app/app.service.ts`

**面试可讲的话术（实施后）**：

> 发布版本的逻辑有三步：从 Workflow 复制快照到 PublishedApp → 更新 App.activePublishedId → 返回新版本。这三步必须在一个事务里完成。Prisma 提供了 `prisma.$transaction()` 交互式事务 API，要么全成功要么全回滚。
>
> 我选择事务而不是手动补偿，因为：(1) 三步都在同一个数据库里操作，(2) 第二步的 activePublishedId 更新如果失败而快照已写入，线上会调用到旧版本，但不会报错——这是静默不一致，比报错更危险。

---

## 三、面试高频追问与应答

### 追问 1：为什么选 PostgreSQL，而不是 MySQL？

**应答**：

> 核心原因是业务数据的关系特征很明显——User→App→Workflow→PublishedApp→Execution 是一条明确的关系链，需要外键、约束、事务。PostgreSQL 在这方面比 MySQL 更严格（比如 CHECK 约束真正生效、事务隔离级别更清晰）。
>
> 另一个原因是工作流配置用 Json 字段存储，PostgreSQL 的 JSONB 支持索引和部分更新，这对后续优化有帮助。

### 追问 2：Prisma 和原生 SQL 怎么选？

**应答**：

> 常规 CRUD 和关系查询用 Prisma，因为类型安全、自动补全、迁移管理这些效率很高。但遇到复杂报表、跨表聚合、或者需要用到 PG 特有功能（比如窗口函数）时，我会用 `prisma.$queryRaw` 或直接 pg Pool 发原生 SQL。
>
> 目前在这个项目里，Prisma 覆盖了所有场景。如果以后执行记录的统计分析变复杂，我预计会用原生 SQL 补。

### 追问 3：Json 字段存工作流配置，有没有隐患？

**应答**：

> 工作流节点和边是树/图状结构，层级深、变化快。如果拆成关系表，每增加一种节点类型就要改 schema，开发和维护成本太高。用 Json 是务实的选择。
>
> 但有明确边界：核心检索字段（status、startedAt、userId、appId）都是独立列，可以建索引。Json 字段只放"不需要查询内部字段"的配置数据。这是一个有意识的权衡，不是偷懒。

### 追问 4：schema 变更怎么处理？

**应答**：

> 全流程走 Prisma Migrate。修改 schema.prisma → `prisma migrate dev --name <描述>` → 自动生成 SQL（会检测是否可能导致数据丢失，比如删列）→ 提交到 Git。生产环境部署时跑 `prisma migrate deploy`，只执行未应用的 migration。
>
> 如果涉及数据迁移（比如拆列、改字段类型），会在 migration.sql 里补充数据迁移语句。

### 追问 5：有没有做过性能优化？

**答辩**：

> 实话说是"设计阶段的优化"多过"运行时的调优"。我在建模时就考虑了查询路径，针对性建了索引，这是成本最低、收益最高的优化。生产级的 PostgreSQL 调优（shared_buffers、work_mem、慢查询分析）目前还没有大规模实践，但已经建立了"先看查询路径、再看执行计划、最后调参数"的思维方式。

---

## 四、面试时推荐的叙事线

**开场 2 分钟**（被问"讲讲你做的后端部分"）：

> 我在 PCG 安全平台做的是管理后端的部分，用的是 NestJS + Prisma 7 + PostgreSQL。这个后端服务的场景是：运营同学创建应用 → 编辑工作流 → 发布版本 → 通过 API Key 调用执行 → 查看执行历史。
>
> 数据库设计上，我把编辑态 Workflow 和发布快照 PublishedApp 拆成了两张表。核心原因是工作流在编辑时频繁变化，但线上调用必须基于稳定版本——如果不拆，编辑就会影响线上。
>
> 技术实现上，我用 Prisma 7 做 schema 管理和类型生成，通过 pg 的 Driver Adapter 接入连接池，保证类型安全的同时不丢掉对连接数的控制。针对运营后台"按状态筛选 + 按时间倒序"的查询模式，我在执行记录表上建了对应索引。发布版本的时候，快照复制和激活版本更新放在一个事务里，保证一致性。
>
> 本地开发环境用 Docker 起 PostgreSQL 17，migrate 和 seed 一条链跑通。

**然后停顿，让面试官追问。**

---

## 五、面试前 1 小时速记卡

打开以下文件快速扫一遍：

| 文件                   | 看什么                                    | 时间  |
| ---------------------- | ----------------------------------------- | ----- |
| `schema.prisma`        | 7 个 Model 的职责 + @@index/@@unique 位置 | 5min  |
| `PrismaService`        | 构造函数参数、生命周期钩子                | 3min  |
| `docker-compose.yaml`  | 端口、数据库名、volume                    | 2min  |
| 本文档"逐条 Claim"章节 | 每条 Claim 的核心话术                     | 10min |
| 本文档"追问"章节       | 5 个高频追问的应答要点                    | 10min |

**记住 5 句话**：

1. Workflow 和 PublishedApp 拆开，是为了区分编辑态与发布态，避免读写竞争
2. 索引是跟着查询路径走的——status 筛选 + startedAt 倒序
3. Prisma 7 + pg Adapter：保留类型安全，不丢连接池控制
4. 发布用事务：快照复制 + 激活版本更新，要么一起成功要么一起失败
5. Docker 起 PG17 + migrate + seed 一条链跑通

---

## 六、常见陷阱（面试时不要说）

| 陷阱                           | 为什么危险                       | 正确替代说法                                    |
| ------------------------------ | -------------------------------- | ----------------------------------------------- |
| "我精通 PostgreSQL"            | 无法证明，容易被深挖打穿         | "我有完整的建模和接入实践经验"                  |
| "Prisma 比原生 SQL 更好"       | 极端表述，面试官会觉得你不懂权衡 | "常规场景用 Prisma，复杂查询会补原生 SQL"       |
| "连接池设了上限防止耗尽"       | 代码里没显式设 max，会被当面打脸 | "基于 pg Pool 管理连接，默认 10 对本地开发足够" |
| "索引越多越好"                 | 暴露不知道索引有写入成本         | "索引是跟着查询路径加的，不是越多越好"          |
| "Json 字段很方便所以都用 Json" | 暴露没有建模意识                 | "核心检索字段结构化，只有配置类数据用 Json"     |
