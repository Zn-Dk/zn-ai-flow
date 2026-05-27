# PROGRESS — 阶段进度追踪

> 记录当前开发进度和下一步计划，每次对话结束后更新。

---

## 当前状态

- **当前阶段**：Phase 2 准备就绪
- **最近完成**：Phase 1 全部完成 + Phase 2 实施步骤文档生成
- **下一步**：Phase 2.1 初始化 NestJS 项目（`apps/api-server/`）

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

| 步骤 | 任务                            | 状态      |
| ---- | ------------------------------- | --------- |
| 2.1  | 初始化 NestJS 项目              | ⬜ 未开始 |
| 2.2  | 全局配置（ConfigModule + 前缀） | ⬜ 未开始 |
| 2.3  | 全局 ValidationPipe             | ⬜ 未开始 |
| 2.4  | 全局异常过滤器                  | ⬜ 未开始 |
| 2.5  | 全局响应拦截器                  | ⬜ 未开始 |
| 2.6  | Prisma 7 集成（PrismaModule）   | ⬜ 未开始 |
| 2.7  | 定义数据模型（Schema）          | ⬜ 未开始 |
| 2.8  | 数据库迁移                      | ⬜ 未开始 |

## Phase 3+ — 业务功能

> 待 Phase 2 完成后规划。

---

## 对话历史摘要

| 时间       | 主题         | 关键结论                                                               |
| ---------- | ------------ | ---------------------------------------------------------------------- |
| 早期       | 选择学习版本 | 基于 miaoma-aiflow 完整版，输出学习路线文档                            |
| 早期       | 工程化配置   | 复用 zn-lowcode 配置，适配扁平 apps 结构，创建所有根目录文件           |
| 近期       | ESLint 问题  | react-hooks rules 应用对象展开而非数组展开（见 NOTES.md）              |
| 近期       | Turbo 配置   | 分析了 Turbo 的作用，提供了完整 turbo.json 配置方案（见 DECISIONS.md） |
| 2026-05-27 | 追踪记录     | 创建 \_agent_dev/ 并拆分为 CLAUDE / DECISIONS / PROGRESS / NOTES       |
| 2026-05-28 | Phase 2 规划 | 生成 phase/phase2-后端基础设施.md，含 8 步实施指南 + 踩坑点            |
