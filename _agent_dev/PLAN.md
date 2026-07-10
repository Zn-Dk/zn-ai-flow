# PLAN — 阶段规划

> Phase 划分 + 验收标准。只回答"做到哪里、什么算做完"，不记录实施细节。
> 决策历史已迁移至 [changelog.md](./changelog.md) 的"历史决策与对话摘要"章节。

---

## 当前状态

- **当前阶段**：`_agent_dev` 结构已按 sdd-workflow skill 标准补全，准备开始 Phase4 实际编码
- **最近完成**：新建 `changelog.md`（代码变更记录）+ `TODO.md`（迁移鉴权待定项）+ 会话级 `progress.md`；`CLAUDE.md` 补充 MARK 约束小节；`.gitignore` 追加会话级文件排除规则；PROGRESS.md → PLAN.md 重命名
- **下一步**：按 phase4 文档实施 P0 任务（4.1 seed → 4.2 App CRUD → 4.3 发布接口+事务 → 4.7 APIKey → 4.8 Guard → 4.9 执行接口占位版），每步完成后追加 `changelog.md` 条目

---

## Phase 1 — 根目录工程化配置

| 任务                                           | 状态                                         |
| ---------------------------------------------- | -------------------------------------------- |
| pnpm workspace 配置（扁平 `apps/*`）           | ✅ 完成                                      |
| ESLint flat config（@stylistic，无 Prettier）  | ✅ 完成                                      |
| TypeScript 配置（base / client / server 三套） | ✅ 完成                                      |
| commitlint + cz-git 提交规范                   | ✅ 完成                                      |
| husky hooks（pre-commit 已注释）               | ✅ 完成                                      |
| .gitignore                                     | ✅ 完成                                      |
| pnpm install                                   | ✅ 完成                                      |
| turbo.json                                     | ✅ 完成（v2.9.15 已安装，turbo.json 已配置） |

## Phase 2 — 后端基础设施（NestJS + Prisma）

> 📄 详细实施步骤：[phase/phase2-后端基础设施.md](./phase/phase2-后端基础设施.md)

| 步骤 | 任务                                   | 状态    |
| ---- | -------------------------------------- | ------- |
| 2.1  | 初始化 NestJS 项目                     | ✅ 完成 |
| 2.2  | 全局配置（ConfigModule + 前缀）        | ✅ 完成 |
| 2.3  | 全局 ValidationPipe                    | ✅ 完成 |
| 2.4  | 全局异常过滤器                         | ✅ 完成 |
| 2.5  | 全局响应拦截器                         | ✅ 完成 |
| 2.6  | PostgreSQL 数据库初始化（Docker）      | ✅ 完成 |
| 2.7  | Prisma 初始化 + 定义数据模型（Schema） | ✅ 完成 |
| 2.8  | 生成 PrismaClient + 数据库迁移         | ✅ 完成 |
| 2.9  | PrismaModule 集成                      | ✅ 完成 |

## Phase 3 — AI 工作流引擎（packages/ai-engine）

> 📄 详细实施步骤：[phase/phase3-AI工作流引擎.md](./phase/phase3-AI工作流引擎.md)

| 步骤 | 任务                      | 状态                    |
| ---- | ------------------------- | ----------------------- |
| 3.1  | 包初始化 + 构建配置       | ✅ 完成                 |
| 3.2  | 核心类型定义              | ✅ 完成                 |
| 3.3  | 图构建器（GraphBuilder）  | ✅ 完成                 |
| 3.4  | 执行上下文（Context）     | ✅ 完成                 |
| 3.5  | 变量解析器（Resolver）    | ✅ 完成                 |
| 3.6  | 节点执行器基类 + 注册表   | ✅ 完成                 |
| 3.7  | Start / End 执行器        | ✅ 完成                 |
| 3.8  | LLM 执行器                | ✅ 完成                 |
| 3.9  | HTTP 执行器               | ✅ 完成                 |
| 3.10 | Intention 执行器（意图识别） | ⏸️ 暂停                 |
| 3.11 | 引擎主循环（Engine）      | ⏸️ 暂停                 |
| 3.12 | 执行日志（Logger）        | ⚠️ 接口已定义，无实现类 |
| 3.13 | 工作流校验器（Validator） | ⏸️ 暂停                 |
| 3.14 | 示例 + 单元测试           | ⏸️ 暂停                 |

## Phase 4 — PostgreSQL 补强 + 业务API鉴权（NestJS，合并原Phase4+Phase9）

> 📄 详细实施步骤：[phase/phase4-PostgreSQL补强.md](./phase/phase4-PostgreSQL补强.md)
>
> 📄 决策依据：[DECISIONS.md](./DECISIONS.md) ADR-011（暂停Phase3）、ADR-012（合并范围+9.4占位说明）

| 优先级 | 步骤 | 任务                                                                   | 对应简历 Claim           | 状态      |
| ------ | ---- | ---------------------------------------------------------------------- | ------------------------ | --------- |
| **P0** | 4.1  | seed 脚本（User/App/Workflow + WorkflowExecution 测试数据）             | seed 流程                | ⬜ 未开始 |
| **P0** | 4.2  | App CRUD 模块（Controller + Service + DTO）                            | 关系建模、列表查询       | ⬜ 未开始 |
| **P0** | 4.3  | 发布接口 + 事务（Workflow→PublishedApp 快照 + activePublishedId 更新） | 分表建模、@@unique、事务 | ⬜ 未开始 |
| **P1** | 4.4  | 执行历史查询接口（分页 + status 筛选 + startedAt 倒序）                | 索引设计、分页查询       | ⬜ 未开始 |
| **P1** | 4.5  | PrismaService 显式连接池配置（connection_limit）                       | 连接池管理               | ⬜ 未开始 |
| **P2** | 4.6  | 第二次 migration（演示 schema 演进）                                   | migrate 流程             | ⬜ 未开始 |
| **P0** | 4.7  | API Key 管理（生成/列表脱敏/撤销）                                     | 安全设计、脱敏           | ⬜ 未开始 |
| **P0** | 4.8  | API Key Guard（鉴权中间件）                                            | 鉴权、Guard 模式         | ⬜ 未开始 |
| **P0** | 4.9  | 外部执行接口（占位版，待 Phase3.11 回补真实执行）                       | 鉴权链路、执行记录       | ⬜ 未开始 |

> 4.1~4.8 零前端依赖、零引擎依赖，可独立验证。4.9 因依赖 Phase 3.11（引擎主循环）先做占位实现。预计总投入约 8-10 小时。

## Phase 5 — 知识库 RAG（可选）

> 📄 详细实施步骤：待生成

| 步骤 | 任务                     | 状态      |
| ---- | ------------------------ | --------- |
| 5.1  | 文本分割器               | ⬜ 未开始 |
| 5.2  | Embedding 服务（Ollama） | ⬜ 未开始 |
| 5.3  | 向量存储（Qdrant）       | ⬜ 未开始 |
| 5.4  | 检索器                   | ⬜ 未开始 |
| 5.5  | Knowledge 节点执行器     | ⬜ 未开始 |

## Phase 6+ — 前端（工作流编辑器 + 监控）

> 待 Phase 3-5 完成后规划。涉及 React Flow、Tiptap、shadcn/ui 等。
