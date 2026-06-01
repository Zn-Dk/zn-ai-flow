# PROGRESS — 阶段进度追踪

> 记录当前开发进度和下一步计划，每次对话结束后更新。

---

## 当前状态

- **当前阶段**：Phase 3 规划完成，准备实施
- **最近完成**：Phase 2 全部完成（NestJS + Prisma）；Phase 3 实施文档已生成
- **下一步**：Phase 3.1 包初始化 + 构建配置（`packages/ai-engine`）

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

| 步骤 | 任务                      | 状态      |
| ---- | ------------------------- | --------- |
| 3.1  | 包初始化 + 构建配置       | ⬜ 未开始 |
| 3.2  | 核心类型定义              | ⬜ 未开始 |
| 3.3  | 图构建器（GraphBuilder）  | ⬜ 未开始 |
| 3.4  | 执行上下文（Context）     | ⬜ 未开始 |
| 3.5  | 变量解析器（Resolver）    | ⬜ 未开始 |
| 3.6  | 节点执行器基类 + 注册表   | ⬜ 未开始 |
| 3.7  | Start / End 执行器        | ⬜ 未开始 |
| 3.8  | LLM 执行器                | ⬜ 未开始 |
| 3.9  | HTTP 执行器               | ⬜ 未开始 |
| 3.10 | Condition 执行器          | ⬜ 未开始 |
| 3.11 | 引擎主循环（Engine）      | ⬜ 未开始 |
| 3.12 | 执行日志（Logger）        | ⬜ 未开始 |
| 3.13 | 工作流校验器（Validator） | ⬜ 未开始 |
| 3.14 | 示例 + 单元测试           | ⬜ 未开始 |

## Phase 4 — 业务 API + 鉴权（apps/api-server/modules）

> 📄 详细实施步骤：待生成

| 步骤 | 任务                          | 状态      |
| ---- | ----------------------------- | --------- |
| 4.1  | API Key Guard（鉴权守卫）     | ⬜ 未开始 |
| 4.2  | Workflow Module（Controller） | ⬜ 未开始 |
| 4.3  | Workflow Service（同步执行）  | ⬜ 未开始 |
| 4.4  | SSE 流式执行                  | ⬜ 未开始 |
| 4.5  | DTO 校验 + 响应类型           | ⬜ 未开始 |

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

---

## 对话历史摘要

| 时间       | 主题         | 关键结论                                                                  |
| ---------- | ------------ | ------------------------------------------------------------------------- |
| 早期       | 选择学习版本 | 基于 miaoma-aiflow 完整版，输出学习路线文档                               |
| 早期       | 工程化配置   | 复用 zn-lowcode 配置，适配扁平 apps 结构，创建所有根目录文件              |
| 近期       | ESLint 问题  | react-hooks rules 应用对象展开而非数组展开（见 NOTES.md）                 |
| 近期       | Turbo 配置   | 分析了 Turbo 的作用，提供了完整 turbo.json 配置方案（见 DECISIONS.md）    |
| 2026-05-27 | 追踪记录     | 创建 \_agent_dev/ 并拆分为 CLAUDE / DECISIONS / PROGRESS / NOTES          |
| 2026-05-28 | Phase 2 规划 | 生成 phase/phase2-后端基础设施.md，含 9 步实施指南 + 踩坑点               |
| 2026-05-31 | Phase 2 实施 | 完成 2.1~2.6；修正 Prisma 步骤顺序（schema→generate→PrismaModule）        |
| 2026-06-01 | Phase 2 完成 | 完成 2.7~2.9；解决 Prisma 7.8 ESM/CJS 冲突（需 CJS 模式 + 重新 generate） |
| 2026-06-01 | Phase 3 规划 | 采用方案 B（独立 Phase 3/4/5/6），生成 phase3-AI工作流引擎.md 实施文档    |
