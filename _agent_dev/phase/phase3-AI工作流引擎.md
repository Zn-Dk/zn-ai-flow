# Phase 3：AI 工作流引擎（packages/ai-engine）

> **预计耗时**：5-7 天
> **前置条件**：Phase 2 已完成（NestJS + Prisma 就绪）
> **验证目标**：`pnpm --filter ai-engine test` 通过，示例工作流可独立执行并输出正确结果
> **对应原规划**：miaoma-aiflow 学习路线 Phase 6

---

## 步骤总览

| 步骤 | 任务                      | 难度   | 说明                           |
| ---- | ------------------------- | ------ | ------------------------------ |
| 3.1  | 包初始化 + 构建配置       | ⭐     | tsup 双格式构建、vitest 测试   |
| 3.2  | 核心类型定义              | ⭐⭐   | Node / Edge / Workflow 类型    |
| 3.3  | 图构建器（GraphBuilder）  | ⭐⭐⭐ | DAG 拓扑排序 + 环检测          |
| 3.4  | 执行上下文（Context）     | ⭐⭐   | 变量存储、节点间数据传递       |
| 3.5  | 变量解析器（Resolver）    | ⭐⭐   | `{{nodeId.field}}` 模板语法    |
| 3.6  | 节点执行器基类 + 注册表   | ⭐⭐   | BaseExecutor + NodeRegistry    |
| 3.7  | Start / End 执行器        | ⭐     | 输入透传 / 输出收集            |
| 3.8  | LLM 执行器                | ⭐⭐⭐ | Ollama 调用、Prompt 模板渲染   |
| 3.9  | HTTP 执行器               | ⭐⭐   | fetch 请求、变量替换           |
| 3.10 | Intention 执行器（意图识别） | ⭐⭐⭐ | LLM 驱动意图识别、分支选择     |
| 3.11 | 引擎主循环（Engine）      | ⭐⭐⭐ | 按拓扑序执行、条件分支动态裁剪 |
| 3.12 | 执行日志（Logger）        | ⭐⭐   | 结构化日志、SSE 回调支持       |
| 3.13 | 工作流校验器（Validator） | ⭐⭐   | 结构合法性校验                 |
| 3.14 | 示例 + 单元测试           | ⭐⭐   | 端到端验证                     |

---

## 3.1 包初始化 + 构建配置

### 目标

在 `packages/ai-engine/` 下创建独立的 TypeScript 包，支持 ESM + CJS 双格式输出。

### 关键步骤

1. **创建目录结构**：

   ```
   packages/ai-engine/
   ├── src/
   │   └── index.ts          # 统一导出入口
   ├── package.json
   ├── tsconfig.json
   ├── tsup.config.ts        # 构建配置
   └── vitest.config.ts      # 测试配置
   ```

2. **package.json 关键配置**：

   ```json
   {
     "name": "@zn-ai-flow/ai-engine",
     "type": "module",
     "exports": {
       ".": {
         "import": "./dist/index.js",
         "require": "./dist/index.cjs"
       }
     },
     "scripts": {
       "build": "tsup",
       "dev": "tsup --watch",
       "test": "vitest run",
       "example": "tsx src/example/run-workflow.ts"
     }
   }
   ```

3. **安装依赖**：

   ```bash
   # 运行时
   pnpm add @langchain/core @langchain/ollama

   # 开发时
   pnpm add -D tsup vitest tsx typescript @types/node
   ```

4. **tsup.config.ts**：

   ```ts
   import { defineConfig } from 'tsup'

   export default defineConfig({
     entry: ['src/index.ts'],
     format: ['esm', 'cjs'],
     dts: true,
     clean: true,
     sourcemap: true,
   })
   ```

5. **根目录 turbo.json 添加 ai-engine 的 build 任务**（已有 `"build": { "dependsOn": ["^build"] }"`，无需额外配置）

### ⚠️ 踩坑点

- **`"type": "module"`**：ai-engine 包使用 ESM（与 api-server 的 CJS 不同），因为 tsup 会同时输出 `.js`（ESM）和 `.cjs`（CJS），消费方按需选择。
- **`workspace:*` 引用**：api-server 的 `package.json` 中用 `"@zn-ai-flow/ai-engine": "workspace:*"` 引用，pnpm 会自动链接。
- **tsup vs tsc**：tsup 基于 esbuild，比 tsc 快 10x+，且自动处理 ESM/CJS 互操作。但不做类型检查，需要配合 `tsc --noEmit` 或 vitest 的类型检查。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/package.json`
- `miaoma-aiflow/packages/ai-engine/tsup.config.ts`
- `miaoma-aiflow/packages/ai-engine/vitest.config.ts`

---

## 3.2 核心类型定义

### 目标

定义工作流的核心数据结构：节点、边、工作流定义、执行结果。

### 关键步骤

1. **创建类型文件**：

   ```
   src/types/
   ├── index.ts          # 统一导出
   ├── node.ts           # 节点类型定义
   ├── workflow.ts        # 工作流定义
   └── logger.ts         # 日志类型
   ```

2. **核心类型设计**：

   ```ts
   // node.ts — 节点类型枚举 + 各节点配置类型
   type NodeType = 'start' | 'end' | 'llm' | 'http' | 'intent' | 'condition' | 'knowledge'
  // 'intent' = LLM 驱动意图识别（3.10 实现）
  // 'condition' = 纯规则条件匹配（后续迭代补充）

   // 节点执行结果（⚠️ 与 miaoma 的差异：miaoma 将此类型定义在 types/logger.ts，
   // 但语义上它属于节点执行产物，应定义在 types/node.ts，logger.ts 反向 import 使用）
   interface NodeExecutionResult {
     success: boolean
     outputs: Record<string, unknown>
     duration: number
     error?: string
   }

   // workflow.ts — 工作流结构定义
   // 节点定义（对应前端 React Flow 的 Node 数据）
   interface WorkflowNode {
     id: string
     type: NodeType
     data: NodeData // 各类型节点的配置数据（联合类型）
     position: { x: number; y: number }
   }

   // 边定义
   interface WorkflowEdge {
     id: string
     source: string // 源节点 ID
     target: string // 目标节点 ID
     sourceHandle?: string // 条件分支的输出端口
   }

   // 工作流定义
   interface WorkflowDefinition {
     id: string
     name: string
     nodes: WorkflowNode[]
     edges: WorkflowEdge[]
   }

   // 工作流执行结果
   interface WorkflowExecutionResult {
     success: boolean
     outputs: Record<string, unknown>
     logs: ExecutionLogEntry[]
     duration: number
     error?: { message: string; nodeId?: string }
   }
   ```

### 📋 类型分层实施顺序（修订）

为避免 `types/node.ts` 与 `core/context.ts` 相互牵引，按“**配置类型归 `types`，运行态类型归 `core`**”拆分：

| 层级        | 归属文件                 | 内容                                                           | 何时添加            |
| ----------- | ------------------------ | -------------------------------------------------------------- | ------------------- |
| **Layer 1** | `types/node.ts`          | `ParamType`、`InputParam`、各 `XxxNodeConfig`（节点配置）      | **3.2（当前步骤）** |
| **Layer 2** | `types/workflow.ts`      | `WorkflowNode`、`WorkflowEdge`、`WorkflowDefinition`（图结构） | **3.2（当前步骤）** |
| **Layer 3** | `core/context.ts`        | `ExecutionContext` + 节点运行态状态/输出存储                   | 3.4 执行上下文      |
| **Layer 4** | `nodes/base-executor.ts` | `BaseNodeExecutor` / `NodeExecutor` 执行契约                   | 3.6 节点执行器      |

**当前步骤（3.2）只需写 Layer 1 + Layer 2 的基础结构**：

```ts
// node.ts — Phase 3.2 只定义节点配置模型
export type ParamType = 'string' | 'number' | 'boolean' | 'array' | 'object'
export interface InputParam { name: string; type: ParamType; ... }
export interface StartNodeConfig { inputs: InputParam[] }
export interface LLMNodeConfig {
  model?: string
  systemPrompt?: string
  userPrompt: string
  temperature?: number
  numCtx?: number
}
export interface HttpNodeConfig { url: string; method: string; ... }
export interface IntentNodeConfig { model: string; intents: Intent[] }
export interface Intent { name: string; description?: string; condition?: string }
// 纯规则条件节点（后续迭代，当前不实现执行器）
export interface ConditionNodeConfig { conditions: ConditionRule[] }
export interface EndNodeConfig { outputs: OutputVariable[] }
export interface KnowledgeNodeConfig { datasetIds: string[]; ... }
```

### ⚠️ 踩坑点

- **`NodeData` 是联合类型**：每种节点类型有不同的配置结构（如 LLM 节点有 `model`、`prompt`，HTTP 节点有 `url`、`method`）。用 discriminated union 或泛型处理。
- **与 Prisma 的 `Json` 类型对应**：数据库中 `nodes` 和 `edges` 存为 JSON，取出后需要 `as unknown as WorkflowNode[]` 断言。
- **前端 React Flow 的 Node 类型**：前端的 `Node<T>` 有额外字段（`selected`、`dragging` 等），后端只需要核心字段。
- **不要一次性写完 `node.ts`**：miaoma 源码的 `node.ts` 有 231 行，但其中 Layer 2-4 的类型在 3.2 阶段用不到。过早定义会导致编译错误（依赖的类型还不存在）或过度设计。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/types/node.ts`（~231 行，分 4 层）
- `miaoma-aiflow/packages/ai-engine/src/types/workflow.ts`（~40 行）
- `miaoma-aiflow/packages/ai-engine/src/types/logger.ts`（~138 行）

> ⚠️ **miaoma 版已知设计缺陷（本项目修正）**：
>
> - `NodeExecutionResult` 定义在 `types/logger.ts`，但它是节点执行产物，语义上应在 `types/node.ts`，`logger.ts` 从那里 import。
> - `types/logger.ts` 直接 import `NodeKind`（来自 `workflow.ts`），导致 logger 接口与 workflow 类型产生耦合。本项目保持相同结构，但需知晓这一依赖关系。

---

## 3.3 图构建器（GraphBuilder）

### 目标

将工作流的 nodes + edges 构建为 DAG（有向无环图），输出拓扑排序后的执行顺序。

### 关键步骤

1. **创建文件**：`src/core/graph-builder.ts`

2. **核心算法**：
   - 构建邻接表（adjacency list）
   - Kahn 算法拓扑排序（BFS 方式，检测环）
   - 条件分支选择（`selectBranch`）：条件节点执行后，只保留匹配分支的后续节点

3. **关键方法**：

   ```ts
   class GraphBuilder {
     // 构建图结构
     build(nodes: WorkflowNode[], edges: WorkflowEdge[]): void

     // 获取拓扑排序后的执行顺序
     getExecutionOrder(): string[]

     // 检测是否有环
     hasCycle(): boolean

     // 条件分支选择：只保留选中分支的后续路径
     selectBranch(conditionNodeId: string, selectedHandle: string): void

     // 获取节点的上游节点（用于变量解析）
     getUpstreamNodes(nodeId: string): string[]
   }
   ```

### ⚠️ 踩坑点

- **环检测**：Kahn 算法天然支持环检测——如果排序后节点数 < 总节点数，说明有环。
- **条件分支动态裁剪**：条件节点有多个输出端口（`sourceHandle`），执行后只有一个分支被选中。`selectBranch` 需要从图中移除未选中分支的所有后续节点，然后重新计算执行顺序。
- **Start 节点入度为 0**：拓扑排序的起点一定是 Start 节点（入度为 0）。
- **多个 End 节点**：理论上可以有多个 End 节点（不同分支汇聚），但通常只有一个。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/core/graph-builder.ts`（~150 行）

---

## 3.4 执行上下文（Context）

### 目标

管理工作流执行过程中的变量存储和节点状态，并为 3.5（变量解析）与 3.6（执行器）提供统一运行态接口。

### 关键设计决策（先回答你的疑问）

- **结论**：`ExecutionContext` 相关类型优先定义在 `src/core/context.ts`（或同目录 `context.types.ts`），**不放在 `types/node.ts`**。
- **原因**：
  1. `types/node.ts` 负责“节点配置模型（静态）”，`ExecutionContext` 属于“运行态容器（动态）”；职责不同。
  2. 放在 `core/` 可避免后续 `nodes/*`、`engine.ts`、`resolver.ts` 对 `types/node.ts` 的反向耦合。
  3. 当前 `ai-engine` 作为单包开发，暂无跨包复用 `ExecutionContext` 的必要，不必过早抽公共类型。

> 仅当未来出现“多个 package 共享同一执行上下文契约”时，再考虑提取到 `types/`。

### 关键步骤

1. **创建文件**：`src/core/context.ts`

2. **最小实现（本阶段必做）**：

   ```ts
   export type NodeStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'

   export interface IExecutionContext {
     // 输入读取
     getInputs(): Record<string, unknown>

     // 输出读写
     setNodeOutputs(nodeId: string, outputs: Record<string, unknown>): void
     getNodeOutputs(nodeId: string): Record<string, unknown> | undefined
     getAllOutputs(): Record<string, Record<string, unknown>>

     // 状态读写
     setNodeStatus(nodeId: string, status: NodeStatus): void
     getNodeStatus(nodeId: string): NodeStatus | undefined
   }

   export class DefaultExecutionContext implements IExecutionContext {
     // 工作流入口输入（Start 节点读取）
     private readonly inputs: Record<string, unknown>

     // 每个节点的输出命名空间：nodeId -> outputs
     private readonly nodeOutputs = new Map<string, Record<string, unknown>>()

     // 每个节点的状态：nodeId -> status
     private readonly nodeStatus = new Map<string, NodeStatus>()

     constructor(inputs: Record<string, unknown>)

     // 输入读取
     getInputs(): Record<string, unknown>

     // 输出读写
     setNodeOutputs(nodeId: string, outputs: Record<string, unknown>): void
     getNodeOutputs(nodeId: string): Record<string, unknown> | undefined
     getAllOutputs(): Record<string, Record<string, unknown>>

     // 状态读写
     setNodeStatus(nodeId: string, status: NodeStatus): void
     getNodeStatus(nodeId: string): NodeStatus | undefined
   }
   ```

3. **本阶段暂不做（避免过度设计）**：
   - 历史版本回滚、快照恢复
   - 复杂并发锁
   - 细粒度权限控制

### 与后续章节的衔接

- **3.5 VariableResolver**：只依赖 `getNodeOutputs` / `getAllOutputs`，不关心内部存储结构。
- **3.6 NodeExecutor**：通过 `setNodeOutputs` 回写运行结果。
- **3.11 Engine**：负责状态流转（`pending -> running -> completed/failed/skipped`）。

### ⚠️ 踩坑点

- **变量命名空间**：必须按 `nodeId` 隔离输出，禁止把所有字段打平成一个全局对象。
- **输入只读原则**：`inputs` 在构造时注入，执行中不允许被节点修改。
- **分支跳过语义**：未选中分支节点应显式标记为 `skipped`，而不是保持 `pending`。
- **失败可观测性**：建议保留 `failed` 状态，避免仅靠异常字符串判断节点是否失败。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/core/context.ts`（~80 行）

---

## 3.5 变量解析器（VariableResolver）

### 目标

解析节点配置中的变量引用模板 `{{nodeId.fieldName}}`，替换为实际值；并支持对象/数组中的递归解析，作为所有执行器的统一变量渲染入口。

### 关键步骤

1. **创建文件**：`src/core/variable-resolver.ts`

2. **先明确与 miaoma 版的对照关系（避免迁移时迷路）**：

| 能力         | miaoma 版          | 文档版（本项目）                  |
| ------------ | ------------------ | --------------------------------- |
| 模板语法     | `${nodeId.var}`    | `{{nodeId.field}}`                |
| 上下文依赖   | `VariableStore`    | `IExecutionContext`               |
| 路径深度     | 两级（`node.var`） | 多级（`node.response.data.name`） |
| 对象递归解析 | 无统一方法         | `resolveObject` 统一处理          |
| 类型保真     | 大多转 string      | 整体变量引用可返回原始类型        |

3. **核心方法签名（建议）**：

   ```ts
   import type { IExecutionContext } from './context'

   export class VariableResolver {
     // 解析字符串模板（可返回原始类型）
     resolve(template: string, context: IExecutionContext): unknown

     // 递归解析对象/数组中的变量引用
     resolveObject<T>(value: T, context: IExecutionContext): T
   }
   ```

4. **模板语法**：
   - `{{start.input_name}}` — 引用 Start 节点输入
   - `{{llm_1.result}}` — 引用节点输出
   - `{{http_1.response.data.name}}` — 支持嵌套路径

5. **分步实现（按这个顺序写，最稳）**：

#### Step A：正则与整体匹配

```ts
const VARIABLE_REGEX = /\{\{\s*(.+?)\s*\}\}/g
const FULL_VARIABLE_REGEX = /^\{\{\s*(.+?)\s*\}\}$/
```

- `VARIABLE_REGEX`：用于混合文本替换（如 `"结果：{{llm_1.result}}"`）
- `FULL_VARIABLE_REGEX`：用于判断“整个字符串就是一个变量”，以便返回 number/boolean/object 原始类型

#### Step B：实现路径取值工具函数

```ts
private getByPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj

  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[key]
  }

  return current
}
```

#### Step C：从表达式读取变量值

```ts
private resolveExpression(expr: string, context: IExecutionContext): unknown {
  const segments = expr.split('.')
  if (segments.length < 2) {
    return undefined
  }

  const [nodeId, ...fieldPath] = segments
  const outputs = context.getNodeOutputs(nodeId)
  if (!outputs) {
    return undefined
  }

  return this.getByPath(outputs, fieldPath)
}
```

#### Step D：实现 `resolve`（关键行为）

```ts
resolve(template: string, context: IExecutionContext): unknown {
  const fullMatch = template.match(FULL_VARIABLE_REGEX)

  // 情况1：整个字符串就是变量引用 -> 返回原始类型
  if (fullMatch) {
    const value = this.resolveExpression(fullMatch[1], context)
    return value === undefined ? template : value
  }

  // 情况2：混合文本 -> 全部替换为字符串
  return template.replace(VARIABLE_REGEX, (raw, expr: string) => {
    const value = this.resolveExpression(expr, context)

    // 未命中变量：保留原模板，便于排查
    if (value === undefined) {
      return raw
    }

    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }

    // object/array 在混合文本里统一序列化
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  })
}
```

#### Step E：实现 `resolveObject`（递归，支持对象 + 数组）

```ts
resolveObject<T>(value: T, context: IExecutionContext): T {
  if (typeof value === 'string') {
    return this.resolve(value, context) as T
  }

  if (Array.isArray(value)) {
    return value.map(item => this.resolveObject(item, context)) as T
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = this.resolveObject(v, context)
    }

    return result as T
  }

  return value
}
```

6. **建议最终文件骨架（省略无关行）**：

```ts
import type { IExecutionContext } from './context'

const VARIABLE_REGEX = /\{\{\s*(.+?)\s*\}\}/g
const FULL_VARIABLE_REGEX = /^\{\{\s*(.+?)\s*\}\}$/

export class VariableResolver {
  // ... getByPath
  // ... resolveExpression

  resolve(template: string, context: IExecutionContext): unknown {
    // ... 按 Step D 实现
  }

  resolveObject<T>(value: T, context: IExecutionContext): T {
    // ... 按 Step E 实现
  }
}

export function createVariableResolver(): VariableResolver {
  return new VariableResolver()
}
```

### 输入输出行为（务必对齐）

| 输入模板                                | 上下文值          | 结果                           |
| --------------------------------------- | ----------------- | ------------------------------ |
| `"{{start.count}}"`                     | `3`               | `3`（number，不是 `"3"`）      |
| `"count={{start.count}}"`               | `3`               | `"count=3"`                    |
| `"{{http_1.response.data}}"`            | `{ name: 'Tom' }` | `{ name: 'Tom' }`              |
| `"用户: {{http_1.response.data.name}}"` | `"Tom"`           | `"用户: Tom"`                  |
| `"{{unknown.field}}"`                   | 无                | 原样保留 `"{{unknown.field}}"` |

### ⚠️ 踩坑点

- **嵌套路径解析**：`{{node.output.nested.field}}` 必须安全访问，遇到 `null/undefined` 直接返回 `undefined`。
- **类型保真**：仅当“整串即变量引用”时返回原始类型；混合文本必须转字符串。
- **数组递归**：`resolveObject` 不仅要处理对象，还要处理数组，否则 HTTP body 常见结构会漏替换。
- **未知变量策略**：本阶段采用“保留原模板”，便于调试；后续若改为抛错，需在执行器层统一处理。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/core/variable-resolver.ts`（语法与依赖不同，但核心思路可对照）

---

## 3.6 节点执行器基类 + 注册表

### 目标

定义节点执行器的抽象基类和注册中心，支持策略模式扩展。

### 前置依赖：ExecutionLogger 接口

> Logger 的完整实现在 3.12，此处只需知道接口签名即可。

```ts
// 前置声明（详细实现见 3.12）
interface ExecutionLogger {
  info(phase: string, message: string, nodeId?: string, data?: unknown): void
  warn(phase: string, message: string, nodeId?: string, data?: unknown): void
  error(phase: string, message: string, nodeId?: string, data?: unknown): void
  debug(phase: string, message: string, nodeId?: string, data?: unknown): void
  // miaoma 版还有以下便捷方法，可选实现：
  nodeStart(nodeId: string, type: NodeType, config: unknown): void
  nodeEnd(nodeId: string, result: NodeExecutionResult): void
  variableResolve(template: string, raw: string, resolved: unknown): void
}
```

### 关键步骤

1. **创建文件**：
   - `src/node/base-executor.ts`
   - `src/node/registry.ts`
   - `src/node/index.ts`

2. **执行器契约接口（Interface）**：

   ```ts
   // 所有执行器必须实现的契约
   interface INodeExecutor<TConfig = Record<string, unknown>> {
     readonly type: NodeType

     execute(
       nodeId: string,
       config: TConfig,
       context: IExecutionContext,
       logger: ExecutionLogger,
     ): Promise<NodeExecutionResult>
   }
   ```

3. **基类设计（模板方法模式）**：

   ```ts
   abstract class BaseNodeExecutor<
     TConfig = Record<string, unknown>,
   > implements INodeExecutor<TConfig> {
     abstract readonly type: NodeType

     // ─── 子类实现：只关注业务逻辑 ───
     protected abstract doExecute(
       nodeId: string,
       config: TConfig,
       context: IExecutionContext,
       logger: ExecutionLogger,
     ): Promise<NodeExecutionResult>

     // ─── 基类实现：统一处理计时、状态流转、输出回写、异常兜底 ───
     async execute(
       nodeId: string,
       config: TConfig,
       context: IExecutionContext,
       logger: ExecutionLogger,
     ): Promise<NodeExecutionResult> {
       const startTime = Date.now()

       try {
         logger.nodeStart(nodeId, this.type, config)

         const result = await this.doExecute(nodeId, config, context, logger)

         // 成功时回写输出到上下文
         if (result.success) {
           context.setNodeOutputs(nodeId, result.outputs)
         }

         const finalResult = { ...result, duration: Date.now() - startTime }
         logger.nodeEnd(nodeId, finalResult)
         return finalResult
       } catch (error) {
         const result: NodeExecutionResult = {
           success: false,
           outputs: {},
           error: error instanceof Error ? error.message : String(error),
           duration: Date.now() - startTime,
         }
         logger.nodeEnd(nodeId, result)
         return result
       }
     }

     // ─── 辅助方法：变量解析（子类可调用） ───

     // 基类持有 VariableResolver 实例（构造时注入或直接 new）
     private readonly resolver = new VariableResolver()

     // 解析单个模板字符串（委托给 VariableResolver.resolve）
     protected resolveTemplate(template: string, context: IExecutionContext): unknown {
       return this.resolver.resolve(template, context)
     }

     // 递归解析整个配置对象（对象/数组/字符串逐层遍历）
     protected resolveObject<T>(value: T, context: IExecutionContext): T {
       return this.resolver.resolveObject(value, context)
     }
   }
   ```

   > **模板方法的价值**：基类统一处理计时/状态/异常/回写，子类 `doExecute` 只写业务。
   > 这意味着 3.7~3.10 的每个执行器都不需要重复写 `try/catch` 和 `context.setNodeOutputs`。

4. **注册表**：

   ```ts
   class NodeRegistry {
     private executors = new Map<NodeType, INodeExecutor<unknown>>()

     register(executor: INodeExecutor<unknown>): void
     get(type: NodeType): INodeExecutor<unknown> | undefined
     has(type: NodeType): boolean
   }
   ```

   说明：
   - 显式使用 `INodeExecutor<unknown>` 不再省略泛型参数，避免被默认泛型误导
   - `NodeRegistry` 的职责只是保存“异构执行器集合”，不负责保留每个节点 `config` 的精确类型

5. **工厂函数**（统一创建并注册所有执行器）：

   ```ts
   function createNodeRegistry(): NodeRegistry {
     const registry = new NodeRegistry()
     registry.register(new StartExecutor())
     registry.register(new LLMExecutor())
     registry.register(new HttpExecutor())
     registry.register(new IntentionExecutor())
     registry.register(new EndExecutor())
     return registry
   }
   ```

### 与 miaoma 版的对照

| 维度          | miaoma 版                                | 文档版（本项目）                       |
| ------------- | ---------------------------------------- | -------------------------------------- |
| 接口          | `NodeExecutor<TConfig>`                  | `INodeExecutor<TConfig>`（I 前缀命名） |
| 模板方法      | `execute`（基类）+ `doExecute`（子类）   | 相同                                   |
| 执行器入参    | `(nodeId, config, context, logger)`      | 相同                                   |
| 变量解析辅助  | `resolveConfigVariables` + `deepResolve` | `resolveTemplate` + `resolveObject`    |
| 解析委托      | 调用 `context.resolveText`               | 调用 `resolver.resolve/resolveObject`  |
| validate 方法 | 有（子类可重写）                         | 暂不实现，3.13 校验器统一处理          |

### ⚠️ 踩坑点

- **策略模式**：新增节点类型只需实现 `BaseNodeExecutor` 并注册，不修改引擎代码。这是面试中可以重点讲的设计模式。
- **节点内聚配置优先**：当前阶段 `LLM` 节点的模型参数直接放在节点配置中，执行器无须依赖全局 `EngineConfig` 注入。
- **模板方法 vs 直接 override execute**：如果子类直接 override `execute`，每个子类都要自己写计时/状态/异常处理 → 大量重复代码。模板方法是 3.7~3.10 能"只关注业务"的前提。
- **Logger 前置依赖**：3.6 依赖 Logger 接口类型，但 Logger 的完整实现在 3.12。学习时只需知道接口签名即可，具体实现后补。
- **3.11 引擎不再重复回写**：因为基类已经在 `execute` 中做了 `context.setNodeOutputs`，引擎主循环不需要再做一次。
- **变量解析不经过 Context**：基类自己持有 `VariableResolver` 实例，辅助方法接收 `context` 参数只是为了读取节点输出数据（`getNodeOutputs`），不在 `IExecutionContext` 上新增 resolve 方法。这保持了 Context 作为纯状态容器的职责单一。
- **NodeStatus 不在基类管理**：3.4 定义的 `setNodeStatus` / `getNodeStatus` 由 3.11 引擎主循环负责调用（`pending → running → completed/failed/skipped`）。基类只负责输出回写，不负责状态流转，避免基类与引擎双写状态导致不一致。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/base-executor.ts`（~112 行）
- `miaoma-aiflow/packages/ai-engine/src/nodes/registry.ts`（~40 行）

---

## 3.7 Start / End 执行器

### 目标

实现最简单的两个节点：Start（输入透传）和 End（输出收集）。

### 关键步骤

1. **Start 执行器**（`src/nodes/executors/start-executor.ts`）：
   - 从 `context.inputs` 获取工作流输入参数
   - 按节点配置的变量定义，提取对应字段
   - 输出 = 输入参数的子集

2. **End 执行器**（`src/nodes/executors/end-executor.ts`）：
   - 从节点配置中读取输出映射（`outputMappings`）
   - 解析每个映射的变量引用
   - 输出 = 解析后的最终结果

### ⚠️ 踩坑点

- **Start 节点的变量定义**：前端编辑器中，Start 节点可以定义输入变量（名称 + 类型 + 默认值）。执行时如果调用方未提供某个变量，使用默认值。
- **End 节点的输出映射**：End 节点配置了 `outputs: [{ name: 'result', value: '{{llm_1.result}}' }]`，需要解析变量引用。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/start-executor.ts`（~80 行）
- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/end-executor.ts`（~100 行）

---

## 3.8 LLM 执行器

### 目标

调用 LLM 大模型，支持 Prompt 模板中的变量引用；当前阶段采用**节点内聚配置**，模型相关参数直接由 `LLMNodeConfig` 提供，不额外引入全局 `EngineConfig.llm`。

### 关键步骤

1. **创建文件**：`src/nodes/executors/llm-executor.ts`

2. **核心逻辑**：
   - 使用 `resolveObject(config, context)` 统一解析节点配置中的模板变量
   - 从节点配置中读取 `model`、`systemPrompt`、`userPrompt`、`assistantPrompt`
   - 按顺序组装 LangChain 消息数组（`SystemMessage` / `HumanMessage` / `AIMessage`）
   - 通过 `ChatOllama` 调用模型
   - 输出 `{ content, tokens }`

3. **配置结构**：

   ```ts
   interface LLMNodeData {
     model: string // 当前节点使用的模型名
     systemPrompt?: string // 系统提示词（支持变量）
     userPrompt: string // 用户消息（支持变量）
     assistantPrompt?: string // 历史 assistant 消息（支持变量）
     temperature?: number // 温度参数
     numCtx?: number // Ollama 上下文窗口大小
     maxTokens?: number // 预留字段，当前实现暂未使用
   }
   ```

4. **调用示例**：

   ```ts
   import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
   import { ChatOllama } from '@langchain/ollama'

   const resolvedConfig = this.resolveObject(config, context)
   const messages: Array<SystemMessage | HumanMessage | AIMessage> = []

   if (resolvedConfig.systemPrompt) {
     messages.push(new SystemMessage({ content: resolvedConfig.systemPrompt }))
   }
   if (resolvedConfig.userPrompt) {
     messages.push(new HumanMessage({ content: resolvedConfig.userPrompt }))
   }
   if (resolvedConfig.assistantPrompt) {
     messages.push(new AIMessage({ content: resolvedConfig.assistantPrompt }))
   }

   const llm = new ChatOllama({
     model: resolvedConfig.model,
     temperature: resolvedConfig.temperature ?? 0.7,
     numCtx: resolvedConfig.numCtx ?? 4096,
   })

   const rsp = await llm.invoke(messages)
   const content = rsp.content as string
   const tokens = estimateTokens(content)

   return {
     success: true,
     outputs: {
       content,
       tokens,
     },
     duration,
   }
   ```

5. **依赖安装**：

   ```bash
   pnpm add @langchain/ollama
   ```

### ⚠️ 踩坑点

- **模板变量解析要覆盖整个配置对象**：相比只解析 `systemPrompt` / `userPrompt`，直接对 `config` 使用 `resolveObject` 更统一，也更适合后续新增字段。
- **消息顺序有语义**：当前实现按 `system → user → assistant` 组装消息；如果后续调整消息顺序，需要同步评估对模型行为的影响。
- **`content` 当前按字符串处理**：现在实现里直接将 `rsp.content` 视为字符串；如果后续发现模型返回复杂结构，再单独补充归一化逻辑。
- **token 统计是估算值**：当前 `tokens` 只是基于字符长度的近似估算，用于日志观测即可，不应当作精确计费依据。
- **与 miaoma 的关系**：仍然沿用 `@langchain/ollama` 方向，但当前文档优先贴合 zn-ai-flow 自己的节点内聚实现，而不是照搬对方的全局配置假设。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/llm-executor.ts`
- `ai-chat/src/lib/ai/llm.ts`

---

## 3.9 HTTP 执行器

### 目标

发送 HTTP 请求，支持 URL、Headers、Body 中的变量引用。

### 关键步骤

1. **创建文件**：`src/nodes/executors/http-executor.ts`

2. **配置结构**：

   ```ts
   interface HttpNodeData {
     url: string // 支持变量
     method: 'GET' | 'POST' | 'PUT' | 'DELETE'
     headers?: Record<string, string> // 支持变量
     body?: string // JSON 字符串，支持变量
     timeout?: number // 超时（毫秒）
   }
   ```

3. **核心逻辑**：
   - 解析 URL、Headers、Body 中的变量引用
   - 使用 `fetch` 发送请求
   - 解析响应（JSON 或 text）
   - 输出 `{ status, data, headers }`

### 最小实现清单（基于当前 zn-ai-flow 现状）

> 目标：先完成可运行的 `HTTPExecutor`，不为了对齐 `miaoma` 额外引入超前抽象。

#### HTTPExecutor 最小输入解析

- 解析 `url`
  - 使用 `resolveTemplate` 处理纯字符串模板
- 解析 `headers`
  - 使用 `resolveObject` 递归解析 `KVPair[]`
  - 仅收集 `key` 非空项
- 解析 `params`
  - 使用 `resolveObject` 递归解析 `KVPair[]`
  - 通过 `URLSearchParams` 挂到 URL
- 解析 `body` / `formData`
  - `json`：允许模板解析后得到 `string | object | array`
  - `x-www-form-urlencoded`：由 `formData` 转 `URLSearchParams`
  - `form-data`：本阶段先按“简化对象提交”处理，不做真实 multipart
  - `none`：不传 body
  - `raw`：直接透传字符串
  - `binary`：若本阶段不实现，显式抛错或返回明确错误，避免静默降级

#### 请求发送与超时

- 使用原生 `fetch`
- 通过 `AbortSignal.timeout(timeout ?? 30000)` 或等价方式实现超时
- `GET` / `DELETE` 默认不传 body

#### 日志与观测性

- 继续沿用通用日志方法即可，不必先补专属 `httpRequest` / `httpResponse` 接口
- 建议至少记录两类日志：
  - `http:request`：`method`、`url`、`headers`、`body`
  - `http:response`：`status`、`headers`、`data`、`duration`
- 如果后续希望把变量解析过程也纳入日志，给 `resolver.resolve` / `resolveObject` 追加可选 `logger` 参数即可，不必回退到 `context.resolveText` 方案

#### 输出结构建议

```ts
{
  success: true,
  outputs: {
    data,
    status,
    headers,
    success: response.ok,
    error: response.ok ? null : `HTTP ${response.status}`,
  },
  duration,
}
```

#### 错误语义建议

- 网络异常 / 超时：
  - 节点执行结果仍可返回 `success: true`
  - 但 `outputs.success = false`
  - `outputs.error` 写入错误信息
- 原因：这样后续 `condition` 节点可以直接基于 `status` / `success` / `error` 做分支判断
- 仅当是“节点配置本身无效”时，再考虑返回 `success: false`

#### 本阶段可后置的内容

- `validate()` / `getOutputSchema()`
- 真实 multipart `form-data`
- 更细粒度的请求重试
- HTTPS 自签名证书兼容
- 专属 Logger 便捷方法

### ⚠️ 踩坑点

- **变量在 JSON Body 中**：Body 是字符串，变量替换后需要确保仍是合法 JSON。
- **超时处理**：使用 `AbortController` + `setTimeout` 实现。
- **错误处理**：HTTP 4xx/5xx 不一定是"失败"，节点应该返回 `success: true` + 状态码，让后续条件节点判断。
- **HTTPS 证书**：开发环境可能需要忽略自签名证书。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/http-executor.ts`（~160 行）

---

## 3.10 Intention 执行器（意图识别）

### 目标

基于 LLM 对用户输入进行意图识别，选择执行分支。

> **与纯规则 Condition 的区别**：当前 3.10 实现的是意图识别（LLM 驱动），而非基于 `{{var}} eq value` 的规则条件匹配。真正的 Condition 执行器（`ConditionNodeConfig`，纯规则匹配）作为后续迭代补充，类型已在 `types/node.ts` 中预留 `'condition'`。

### 关键步骤

1. **创建文件**：`src/nodes/executors/intention-executor.ts`

2. **配置结构**（已在 3.2 定义）：

   ```ts
   // 意图节点配置
   interface IntentNodeConfig {
     model: string
     intents: Intent[]
   }

   // 意图定义
   interface Intent {
     name: string
     description?: string
     condition?: string
   }
   ```

3. **核心逻辑**（参考 miaoma `condition-executor.ts`）：
   - 从上游节点获取输入文本（优先找 `output` 字段，再找字符串类型输出）
   - 构建意图列表字符串（`1. intentName: description`）
   - 构建 LLM 系统提示词，要求 LLM 以 JSON 格式返回 `{"intent": "意图名称", "confidence": 0.95}`
   - 使用 `ChatOllama`（temperature=0）进行意图识别
   - 解析 LLM 响应，提取 `intent` 和 `confidence`
   - 如果没有匹配到任何意图，使用第一个意图作为默认（confidence=0.3）
   - 计算分支ID：`intent-${intentIndex}`

4. **输出**：
   - `{ matchedIntent: string, confidence: number }`
   - `matchedBranch: string`（如 `intent-0`）— 引擎收到后调用 `graphBuilder.selectBranch(nodeId, matchedBranch)`

### ⚠️ 踩坑点

- **与 miaoma 的差异**：miaoma 中类名仍为 `ConditionExecutor`、`type = 'condition'`，但实际实现就是意图识别。本项目将语义与命名对齐，类名为 `IntentionExecutor`、`type = 'intent'`，真正的 `condition` 类型留给纯规则条件节点。
- **与 GraphBuilder 的协作**：意图节点执行后，引擎需要调用 `selectBranch` 裁剪未选中的分支，然后重新获取剩余的执行顺序。分支ID 格式为 `intent-${index}`，对应 edge 的 `sourceHandle`。
- **LLM 响应解析**：LLM 可能不返回纯 JSON。需要先用正则提取 `{...}` 子串，再 `JSON.parse`；解析失败时降级为关键词匹配（检查响应内容是否包含意图名称）。
- **temperature=0**：意图识别需要确定性输出，温度设为 0。
- **默认意图策略**：如果 LLM 未匹配到任何意图，使用第一个意图作为默认（低 confidence），避免工作流中断。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/condition-executor.ts`（189 行，语义为意图识别）

---

## 3.11 引擎主循环（Engine）

### 目标

编排所有组件，按拓扑序执行工作流。

### 关键步骤

1. **创建文件**：`src/core/engine.ts`

2. **核心流程**：

   ```ts
   class WorkflowEngine {
     async execute(
       workflow: WorkflowDefinition,
       inputs: Record<string, unknown>,
       callbacks?: ExecutionCallbacks,
     ): Promise<WorkflowExecutionResult> {
       // 1. 校验工作流
       const validation = this.validator.validate(workflow)
       if (!validation.valid) throw new Error(validation.errors.join(', '))

       // 2. 构建图 + 拓扑排序
       const graph = new GraphBuilder()
       graph.build(workflow.nodes, workflow.edges)

       // 3. 创建执行上下文
       const context = new DefaultExecutionContext(inputs)
       const logger = new ExecutionLogger()

       // 4. 按拓扑序执行
       let executionOrder = graph.getExecutionOrder()

       for (const nodeId of executionOrder) {
         const node = workflow.nodes.find(n => n.id === nodeId)!
         const executor = this.registry.get(node.type)

         callbacks?.onNodeStart?.(nodeId, node.type, node.data.name)

         const result = await executor.execute(node, context, logger)
         context.setNodeOutputs(nodeId, result.outputs)
         context.markCompleted(nodeId)

         callbacks?.onNodeEnd?.(nodeId, result)

        // 意图节点：裁剪分支，重新计算执行顺序
        if (node.type === 'intent' && result.outputs.matchedBranch) {
          graph.selectBranch(nodeId, result.outputs.matchedBranch as string)
           executionOrder = graph.getExecutionOrder()
         }
       }

       // 5. 收集最终输出
       return {
         success: true,
         outputs: context.getFinalOutputs(),
         logs: logger.getLogs(),
         duration,
       }
     }
   }
   ```

3. **工厂函数**（对外暴露的 API）：

   ```ts
   export function createWorkflowEngine(): WorkflowEngine {
     return new WorkflowEngine()
   }
   ```

### ⚠️ 踩坑点

- **条件分支后重新计算执行顺序**：这是最复杂的部分。`selectBranch` 后，`getExecutionOrder()` 返回的是**剩余未执行**的节点顺序，已执行的节点不会重复。
- **错误处理策略**：单个节点失败时，是终止整个工作流还是跳过？miaoma 的实现是终止并记录错误节点。
- **回调时机**：`onNodeStart` 在执行前调用，`onNodeEnd` 在执行后调用。SSE 流式模式依赖这些回调。
- **超时控制**：可以用 `Promise.race([executor.execute(...), timeout(ms)])` 实现全局超时。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/core/engine.ts`（~200 行）

---

## 3.12 执行日志（Logger）

### 目标

记录工作流执行过程中的结构化日志，支持分级和节点追踪。

### 关键步骤

1. **创建文件**：`src/logger/execution-logger.ts`

2. **日志条目结构**：

   ```ts
   interface ExecutionLogEntry {
     timestamp: number
     level: 'info' | 'warn' | 'error' | 'debug'
     phase: 'engine' | 'node' | 'variable'
     message: string
     nodeId?: string
     data?: unknown
   }
   ```

3. **Logger 类**：

   ```ts
   class ExecutionLogger {
     private logs: ExecutionLogEntry[] = []

     info(phase: LogPhase, message: string, nodeId?: string): void
     warn(phase: LogPhase, message: string, nodeId?: string): void
     error(phase: LogPhase, message: string, nodeId?: string): void
     debug(phase: LogPhase, message: string, nodeId?: string): void

     // 语义化便捷方法（phase 由方法内部确定，调用方无需传入）
     nodeStart(nodeId: string, type: NodeType, config: unknown): void
     nodeEnd(nodeId: string, result: NodeExecutionResult): void
     variableResolve(
       expression: string,
       originalValue: string,
       resolvedValue: unknown,
     ): void

     getLogs(): ExecutionLogEntry[]
   }
   ```

### ⚠️ 踩坑点

- **日志与 SSE 回调的关系**：Logger 记录的是持久化日志（存入数据库），SSE 回调是实时推送。两者可以共存。
- **日志量控制**：verbose 模式下记录所有变量解析过程，生产模式只记录关键节点。
- **⚠️ miaoma 版已知 bug**：`DefaultExecutionLogger` 中通用的 `debug/info/warn/error` 方法将 `phase` 硬编码为固定值（如 `info` 写死 `'workflow:start'`、`error` 写死 `'workflow:end'`），这是错误的——通用方法可能在任意阶段被调用。本项目修正方式：通用方法的 `phase` 参数由调用方传入，不硬编码。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/logger/execution-logger.ts`（~200 行）

---

## 3.13 工作流校验器（Validator）

### 目标

在执行前校验工作流结构的合法性。

### 关键步骤

1. **创建文件**：
   - `src/validators/workflow-validator.ts`
   - `src/validators/node-validators/`（各节点类型的校验器）

2. **校验规则**：
   - 必须有且仅有一个 Start 节点
   - 必须有至少一个 End 节点
   - 不能有环（DAG）
   - 所有节点必须可达（从 Start 出发）
   - 各节点类型的必填字段校验（如 LLM 必须有 model 和 prompt）

3. **返回结构**：

   ```ts
   interface ValidationResult {
     valid: boolean
     errors: ValidationError[]
   }

   interface ValidationError {
     nodeId?: string
     field?: string
     message: string
   }
   ```

### ⚠️ 踩坑点

- **校验时机**：执行前校验（fail fast），不要等到执行到某个节点才发现配置缺失。
- **前端也需要校验**：前端编辑器在"保存"和"运行"时也会调用校验，但前端校验是 UX 优化，后端校验是安全保障。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/validators/workflow-validator.ts`（~100 行）
- `miaoma-aiflow/packages/ai-engine/src/validators/node-validators/`（每个 ~30 行）

---

## 3.14 示例 + 单元测试

### 目标

编写端到端示例验证引擎正确性。对核心算法模块编写单元测试。

### 关键步骤

1. **示例工作流**（`src/example/run-workflow.ts`）：

   ```
   Start(输入: topic) → LLM(生成文章) → End(输出: article)
   ```

2. **单元测试**（使用 vitest，仅核心模块）：
   - ✅ `GraphBuilder` 测试：拓扑排序、环检测、分支裁剪（**必写**，纯算法）
   - ✅ `IntentionExecutor` 测试：意图识别匹配逻辑（**必写**，分支逻辑易出 bug）
   - 🟡 `VariableResolver` 测试：模板解析、嵌套路径（可选）
   - ❌ 其他模块：用示例端到端验证即可，不需要单独写测试

3. **运行方式**：

   ```bash
   # 运行示例（需要可访问的 Ollama 兼容服务）
   pnpm --filter ai-engine example

   # 运行测试（不依赖真实 LLM 服务，mock LLM 调用）
   pnpm --filter ai-engine test
   ```

### ⚠️ 踩坑点

- **LLM 测试需要 Mock**：单元测试不应依赖外部服务。使用 vitest 的 `vi.mock` 模拟 `ChatOllama`。
- **示例需要可访问的模型服务**：`pnpm example` 是端到端验证，需要配置可访问的 Ollama 兼容地址与默认模型。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/example/run-workflow.ts`（~250 行）
- `miaoma-aiflow/packages/ai-engine/src/knowledge/__tests__/`（测试示例）

---

## 最终验证清单

完成所有步骤后，执行以下验证：

```bash
# 1. 构建通过
pnpm --filter ai-engine build

# 2. 类型检查通过
pnpm --filter ai-engine exec tsc --noEmit

# 3. 单元测试通过
pnpm --filter ai-engine test

# 4. 示例运行成功（需要 Ollama）
pnpm --filter ai-engine example

# 5. api-server 能引用 ai-engine
pnpm --filter api-server build
```

---

## 文件结构（完成后）

```
packages/ai-engine/
├── src/
│   ├── index.ts                    # 统一导出
│   ├── core/
│   │   ├── index.ts
│   │   ├── engine.ts               # WorkflowEngine 主类
│   │   ├── graph-builder.ts        # 图构建器（拓扑排序）
│   │   ├── context.ts              # 执行上下文
│   │   └── variable-resolver.ts    # 变量解析器
│   ├── nodes/
│   │   ├── index.ts
│   │   ├── base-executor.ts        # 基类
│   │   ├── registry.ts             # 注册中心
│   │   └── executors/
│   │       ├── start-executor.ts
│   │       ├── end-executor.ts
│   │       ├── llm-executor.ts
│   │       ├── http-executor.ts
│   │       └── intention-executor.ts
│   ├── logger/
│   │   ├── index.ts
│   │   └── execution-logger.ts
│   ├── validators/
│   │   ├── index.ts
│   │   ├── workflow-validator.ts
│   │   └── node-validators/
│   │       ├── index.ts
│   │       ├── start-validator.ts
│   │       ├── end-validator.ts
│   │       ├── llm-validator.ts
│   │       ├── http-validator.ts
│   │       └── intention-validator.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── node.ts
│   │   ├── workflow.ts
│   │   └── logger.ts
│   └── example/
│       └── run-workflow.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## 面试亮点

Phase 3 完成后，可以在面试中重点展开的技术点：

1. **DAG 拓扑排序**：Kahn 算法、环检测、动态分支裁剪
2. **策略模式 + 注册中心**：节点执行器的可扩展架构
3. **模板引擎**：变量解析器的递归路径解析
4. **工作流引擎设计**：执行上下文、回调机制、错误处理策略
5. **Monorepo 包管理**：tsup 双格式构建、workspace 引用
