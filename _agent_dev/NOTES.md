# NOTES — 踩坑记录与注意事项

> 只追加，不修改历史记录。记录具体的坑和解法。

---

## 2026-05-27 — ESLint react-hooks rules 展开方式

- **问题**：`eslint-plugin-react-hooks` 的 `recommended.rules` 是一个**对象**，不是数组
- **错误写法**：`[...reactHooks.configs.recommended.rules]`（数组展开，会报错）
- **正确写法**：`{...reactHooks.configs.recommended.rules}`（对象展开）
- **场景**：在 `eslint.config.ts` 的 `rules` 字段中合并 react-hooks 推荐规则时

---

## 待注意事项

1. **根目录 `1.tsx` 测试文件**：遗留的 ESLint 测试文件，后续可删除
2. **docker-compose**：用户自行学习配置，需要 PostgreSQL + Qdrant 两个服务
3. **husky pre-commit**：个人项目，`pre-commit` 中的 `lint-staged` 已注释，不做硬性要求
