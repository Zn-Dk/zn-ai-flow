# NOTES — 踩坑记录与注意事项

> 只追加，不修改历史记录。记录具体的坑和解法。

---

## 2026-05-27 — ESLint react-hooks rules 展开方式

- **问题**：`eslint-plugin-react-hooks` 的 `recommended.rules` 是一个**对象**，不是数组
- **错误写法**：`[...reactHooks.configs.recommended.rules]`（数组展开，会报错）
- **正确写法**：`{...reactHooks.configs.recommended.rules}`（对象展开）
- **场景**：在 `eslint.config.ts` 的 `rules` 字段中合并 react-hooks 推荐规则时

---

## 2026-05-31 — PostgreSQL Docker 镜像版本

- **问题**：`postgres:18` 镜像启动后立即 crash（down 掉），因为 PostgreSQL 18 目前还在 beta/开发阶段
- **解决**：使用 `postgres:17-alpine`（当前最新稳定版 + 轻量镜像，~80MB vs ~400MB）
- **原因**：miaoma 项目的 docker-compose 中也用了 `postgres:18`，大概率是 AI 生成时错误预测了版本号

---

## 2026-05-31 — Prisma 步骤顺序依赖

- **问题**：phase2 文档原始顺序是先写 PrismaModule（extends PrismaClient），再定义 schema，再 generate。但 `PrismaClient` 类是 `prisma generate` 产出的，不先 generate 就无法 import
- **正确顺序**：`schema.prisma` → `prisma generate`（产出 PrismaClient）→ `PrismaService extends PrismaClient`
- **已修正**：2.7 定义 Schema → 2.8 generate + migrate → 2.9 PrismaModule 集成

---

## 2026-05-31 — docker-compose `version` 字段已废弃

- **结论**：Docker Compose V2（`docker compose` 命令）完全忽略 `version` 字段，写不写都无所谓
- **建议**：新项目直接省略 `version` 字段，保持文件简洁

---

## 2026-06-01 — Prisma 7.8 ESM/CJS 模块格式冲突

- **问题**：`package.json` 有 `"type": "module"` 时，`prisma generate` 生成纯 ESM 代码（含 `import.meta.url`、`.js` 后缀导入）。移除 `"type": "module"` 后 Node.js 以 CJS 运行，但 Prisma 生成的 ESM 代码报 `exports is not defined in ES module scope`
- **根因**：Prisma 7.8 会根据 `package.json` 的 `"type"` 字段决定生成 ESM 还是 CJS 格式代码。修改 `"type"` 后必须重新 `prisma generate`
- **解决**：
  1. 移除 `"type": "module"`（NestJS 标准 CJS 模式）
  2. `tsconfig.json` 改为 `"module": "commonjs"`, `"moduleResolution": "node"`
  3. 重新执行 `prisma generate`（生成 CJS 兼容代码）
  4. `nest-cli.json` 使用 `"builder": "swc"` 加速编译
- **对比**：miaoma 用 Prisma 7.2 不受影响（7.2 生成的代码本身就是 CJS 兼容的）

---

## 2026-06-01 — 异常过滤器 `exception.getResponse()` 类型不安全

- **问题**：照搬 miaoma 的 `as Record<string, unknown>` + `resp.code as string` 写法，访问不存在路由时 `code` 取到 `undefined`，fallback 到 `INTERNAL_SERVER_ERROR` 而非 `NOT_FOUND`
- **根因**：NestJS 内置异常返回 `{ statusCode, message, error }`，没有 `code` 字段；自定义异常才有 `{ code, message, details }`
- **解决**：定义 `isCustomResponse` 类型守卫（检查 `'code' in resp`），用 if/else 显式区分自定义异常和 NestJS 内置异常，避免不安全的类型断言；内置异常用 `mapStatusToCode(status)` 映射；`message` 兼容 `string | string[]`（ValidationPipe 场景）
- **教训**：参考源码时不能照抄类型断言，需要理解 NestJS 内置异常和自定义异常的结构差异

---

## 待注意事项

1. **根目录 `1.tsx` 测试文件**：遗留的 ESLint 测试文件，后续可删除
2. **docker-compose**：用户自行学习配置，需要 PostgreSQL + Qdrant 两个服务
3. **husky pre-commit**：个人项目，`pre-commit` 中的 `lint-staged` 已注释，不做硬性要求
