第四步：各子包确保有对应的 scripts
Turbo 只会执行子包 package.json 中存在的 script，不存在的会跳过（不报错）。

packages/ 下的共享包（如果有，需要先编译的）：

{
"scripts": {
"build": "tsup",
"build:watch": "tsup --watch",
"dev": "tsup --watch",
"typecheck": "tsc --noEmit",
"clean": "rimraf dist build"
}
}
apps/ 下的 Next.js 应用：

{
"scripts": {
"dev": "next dev",
"build": "next build",
"typecheck": "tsc --noEmit",
"clean": "rimraf .next"
}
}

---

使用方式

# 启动所有子包的 dev（自动并行）

pnpm dev

# 按拓扑顺序构建所有包（packages 先，apps 后）

pnpm build

# 只构建某个子包

pnpm --filter @zn/ai-engine build

# 清理所有构建产物和缓存

pnpm clean
