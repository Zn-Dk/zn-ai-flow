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
| 3.10 | Condition 执行器          | ⭐⭐⭐ | 多条件规则匹配、分支选择       |
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
   pnpm add @langchain/core @langchain/openai

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
   // node.ts — 节点类型枚举
   type NodeType = 'start' | 'llm' | 'http' | 'condition' | 'knowledge' | 'end'

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

   // 节点执行结果
   interface NodeExecutionResult {
     success: boolean
     outputs: Record<string, unknown>
     duration: number
     error?: string
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

### ⚠️ 踩坑点

- **`NodeData` 是联合类型**：每种节点类型有不同的配置结构（如 LLM 节点有 `model`、`prompt`，HTTP 节点有 `url`、`method`）。用 discriminated union 或泛型处理。
- **与 Prisma 的 `Json` 类型对应**：数据库中 `nodes` 和 `edges` 存为 JSON，取出后需要 `as unknown as WorkflowNode[]` 断言。
- **前端 React Flow 的 Node 类型**：前端的 `Node<T>` 有额外字段（`selected`、`dragging` 等），后端只需要核心字段。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/types/node.ts`（~120 行）
- `miaoma-aiflow/packages/ai-engine/src/types/workflow.ts`（~40 行）
- `miaoma-aiflow/packages/ai-engine/src/types/logger.ts`（~80 行）

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

管理工作流执行过程中的变量存储和节点状态。

### 关键步骤

1. **创建文件**：`src/core/context.ts`

2. **核心设计**：

   ```ts
   class ExecutionContext {
     // 存储每个节点的输出
     private nodeOutputs: Map<string, Record<string, unknown>>

     // 节点执行状态
     private nodeStatus: Map<string, 'pending' | 'running' | 'completed' | 'skipped'>

     // 工作流输入参数（Start 节点透传）
     private inputs: Record<string, unknown>

     // 设置节点输出
     setNodeOutputs(nodeId: string, outputs: Record<string, unknown>): void

     // 获取节点输出（供下游节点引用）
     getNodeOutputs(nodeId: string): Record<string, unknown> | undefined

     // 标记节点完成
     markCompleted(nodeId: string): void

     // 获取所有已完成节点的输出（用于变量解析）
     getAllOutputs(): Record<string, Record<string, unknown>>
   }
   ```

### ⚠️ 踩坑点

- **变量命名空间**：每个节点的输出以 `nodeId` 为命名空间隔离，避免冲突。
- **执行顺序保证**：由于拓扑排序，当节点 B 执行时，其上游节点 A 一定已完成，`getNodeOutputs('A')` 一定有值。
- **条件分支跳过**：未被选中分支上的节点标记为 `skipped`，不执行。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/core/context.ts`（~80 行）

---

## 3.5 变量解析器（VariableResolver）

### 目标

解析节点配置中的变量引用模板 `{{nodeId.fieldName}}`，替换为实际值。

### 关键步骤

1. **创建文件**：`src/core/variable-resolver.ts`

2. **核心逻辑**：

   ```ts
   class VariableResolver {
     // 解析模板字符串中的变量引用
     resolve(template: string, context: ExecutionContext): string

     // 解析对象中所有字符串字段的变量引用（递归）
     resolveObject(
       obj: Record<string, unknown>,
       context: ExecutionContext,
     ): Record<string, unknown>
   }
   ```

3. **模板语法**：
   - `{{start.input_name}}` — 引用 Start 节点的输入变量
   - `{{llm_1.result}}` — 引用 LLM 节点的输出
   - `{{http_1.response.data.name}}` — 支持嵌套路径

4. **实现要点**：
   - 正则匹配 `\{\{(.+?)\}\}`
   - 按 `.` 分割路径，逐层取值
   - 未找到的变量保留原始模板（或抛错，取决于策略）

### ⚠️ 踩坑点

- **嵌套路径解析**：`{{node.output.nested.field}}` 需要递归取值，注意 `null` / `undefined` 的安全访问。
- **非字符串字段**：如果模板整体就是一个变量引用（如 `{{start.count}}`），且原始值是 number，应该返回 number 而非 string。只有当模板包含混合文本时才转为 string。
- **循环引用**：理论上不会出现（拓扑排序保证），但防御性编程可以加检测。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/core/variable-resolver.ts`（~70 行）

---

## 3.6 节点执行器基类 + 注册表

### 目标

定义节点执行器的抽象基类和注册中心，支持策略模式扩展。

### 关键步骤

1. **创建文件**：
   - `src/nodes/base-executor.ts`
   - `src/nodes/registry.ts`
   - `src/nodes/index.ts`

2. **基类设计**：

   ```ts
   abstract class BaseNodeExecutor {
     abstract readonly type: NodeType

     // 执行节点逻辑
     abstract execute(
       node: WorkflowNode,
       context: ExecutionContext,
       logger: ExecutionLogger,
     ): Promise<NodeExecutionResult>

     // 变量解析辅助方法（子类可调用）
     protected resolveVariables(template: string, context: ExecutionContext): string
   }
   ```

3. **注册表**：

   ```ts
   class NodeRegistry {
     private executors = new Map<NodeType, BaseNodeExecutor>()

     register(executor: BaseNodeExecutor): void
     get(type: NodeType): BaseNodeExecutor
     has(type: NodeType): boolean
   }
   ```

4. **工厂函数**（统一创建并注册所有执行器）：

   ```ts
   function createNodeRegistry(config: EngineConfig): NodeRegistry {
     const registry = new NodeRegistry()
     registry.register(new StartExecutor())
     registry.register(new LLMExecutor(config))
     registry.register(new HttpExecutor())
     registry.register(new ConditionExecutor())
     registry.register(new EndExecutor())
     return registry
   }
   ```

### ⚠️ 踩坑点

- **策略模式**：新增节点类型只需实现 `BaseNodeExecutor` 并注册，不修改引擎代码。这是面试中可以重点讲的设计模式。
- **配置注入**：LLM 执行器需要 `ollamaBaseUrl` 等配置，通过构造函数注入。
- **错误处理**：基类可以提供 `try/catch` 包装，子类只需关注核心逻辑。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/base-executor.ts`（~80 行）
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

调用 LLM 大模型（云端 API），支持 Prompt 模板中的变量引用。

### 关键步骤

1. **创建文件**：`src/nodes/executors/llm-executor.ts`

2. **核心逻辑**：
   - 从节点配置中获取 `model`、`prompt`（系统提示词）、`userMessage`（用户消息）
   - 解析 prompt 和 userMessage 中的变量引用
   - 通过 LangChain 的 `ChatOpenAI`（兼容 OpenAI 接口的云模型）调用
   - 返回 `{ result: string }` 作为节点输出

3. **配置结构**：

   ```ts
   interface LLMNodeData {
     model: string // 如 'gpt-4o-mini'、'deepseek-chat'、'qwen-plus'
     systemPrompt: string // 系统提示词（支持变量）
     userMessage: string // 用户消息（支持变量）
     temperature?: number // 温度参数
   }
   ```

4. **引擎配置**（支持任意 OpenAI 兼容接口）：

   ```ts
   interface EngineConfig {
     llm: {
       baseUrl: string // 如 'https://api.deepseek.com/v1'
       apiKey: string // 从环境变量读取
       defaultModel: string // 默认模型名
     }
   }
   ```

5. **调用示例**：

   ```ts
   import { ChatOpenAI } from '@langchain/openai'

   const llm = new ChatOpenAI({
     configuration: { baseURL: this.config.llm.baseUrl },
     apiKey: this.config.llm.apiKey,
     modelName: nodeData.model || this.config.llm.defaultModel,
     temperature: nodeData.temperature ?? 0.7,
   })

   const response = await llm.invoke([
     { role: 'system', content: resolvedSystemPrompt },
     { role: 'user', content: resolvedUserMessage },
   ])

   return { success: true, outputs: { result: response.content } }
   ```

6. **依赖安装**：

   ```bash
   pnpm add @langchain/openai
   # 替代原来的 @langchain/ollama
   ```

### ⚠️ 踩坑点

- **OpenAI 兼容接口**：DeepSeek、通义千问、Moonshot 等国产模型都提供 OpenAI 兼容的 API，只需修改 `baseUrl` 和 `apiKey`。LangChain 的 `ChatOpenAI` 天然支持。
- **API Key 安全**：Key 从环境变量读取（`.env` 中配置 `LLM_API_KEY`），不要硬编码。
- **超时处理**：云模型通常比本地快，但仍需设置超时（建议 30s）。
- **Token 统计**：LangChain 响应中有 `usage` 字段（`promptTokens` + `completionTokens`），可以提取用于监控。
- **与 miaoma 的差异**：miaoma 用 `@langchain/ollama`（本地模型），我们用 `@langchain/openai`（云模型）。架构相同，只是 LLM provider 不同。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/llm-executor.ts`（~90 行，改 provider 即可）

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

### ⚠️ 踩坑点

- **变量在 JSON Body 中**：Body 是字符串，变量替换后需要确保仍是合法 JSON。
- **超时处理**：使用 `AbortController` + `setTimeout` 实现。
- **错误处理**：HTTP 4xx/5xx 不一定是"失败"，节点应该返回 `success: true` + 状态码，让后续条件节点判断。
- **HTTPS 证书**：开发环境可能需要忽略自签名证书。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/http-executor.ts`（~160 行）

---

## 3.10 Condition 执行器

### 目标

根据条件规则选择执行分支。

### 关键步骤

1. **创建文件**：`src/nodes/executors/condition-executor.ts`

2. **配置结构**：

   ```ts
   interface ConditionNodeData {
     conditions: ConditionRule[]
   }

   interface ConditionRule {
     id: string // 对应 edge 的 sourceHandle
     variable: string // 要判断的变量引用，如 '{{http_1.status}}'
     operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'empty' | 'notEmpty'
     value?: string // 比较值
   }
   ```

3. **核心逻辑**：
   - 按顺序遍历条件规则
   - 解析变量引用，获取实际值
   - 按 operator 比较
   - 返回第一个匹配的规则 ID（作为选中的分支）
   - 如果都不匹配，走 `else` 分支（最后一个）

4. **输出**：
   - `{ selectedBranch: string }` — 选中的分支 ID
   - 引擎收到后调用 `graphBuilder.selectBranch(nodeId, selectedBranch)`

### ⚠️ 踩坑点

- **与 GraphBuilder 的协作**：条件节点执行后，引擎需要调用 `selectBranch` 裁剪未选中的分支，然后重新获取剩余的执行顺序。
- **类型转换**：比较时需要注意类型（`"200" == 200`？），建议统一转为字符串比较，或提供显式类型转换。
- **else 分支**：如果所有条件都不匹配，应该有一个默认分支。前端编辑器中通常最后一个条件是 "else"。

### 参考源码

- `miaoma-aiflow/packages/ai-engine/src/nodes/executors/condition-executor.ts`（~160 行）

---

## 3.11 引擎主循环（Engine）

### 目标

编排所有组件，按拓扑序执行工作流。

### 关键步骤

1. **创建文件**：`src/core/engine.ts`

2. **核心流程**：

   ```ts
   class WorkflowEngine {
     constructor(private config: EngineConfig) {}

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
       const context = new ExecutionContext(inputs)
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

         // 条件节点：裁剪分支，重新计算执行顺序
         if (node.type === 'condition' && result.outputs.selectedBranch) {
           graph.selectBranch(nodeId, result.outputs.selectedBranch as string)
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
   export function createWorkflowEngine(config: EngineConfig): WorkflowEngine {
     return new WorkflowEngine(config)
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

     info(phase: string, message: string, nodeId?: string): void
     warn(phase: string, message: string, nodeId?: string): void
     error(phase: string, message: string, nodeId?: string): void

     getLogs(): ExecutionLogEntry[]
   }
   ```

### ⚠️ 踩坑点

- **日志与 SSE 回调的关系**：Logger 记录的是持久化日志（存入数据库），SSE 回调是实时推送。两者可以共存。
- **日志量控制**：verbose 模式下记录所有变量解析过程，生产模式只记录关键节点。

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
   - ✅ `ConditionExecutor` 测试：各种 operator 的匹配逻辑（**必写**，分支逻辑易出 bug）
   - 🟡 `VariableResolver` 测试：模板解析、嵌套路径（可选）
   - ❌ 其他模块：用示例端到端验证即可，不需要单独写测试

3. **运行方式**：

   ```bash
   # 运行示例（需要云模型 API Key 配置在 .env 中）
   pnpm --filter ai-engine example

   # 运行测试（不需要云模型，mock LLM 调用）
   pnpm --filter ai-engine test
   ```

### ⚠️ 踩坑点

- **LLM 测试需要 Mock**：单元测试不应依赖外部服务。使用 vitest 的 `vi.mock` 模拟 `ChatOpenAI`。
- **示例需要真实 API Key**：`pnpm example` 是端到端验证，需要 `.env` 中配置 `LLM_API_KEY` 和 `LLM_BASE_URL`。

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
│   │       └── condition-executor.ts
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
│   │       └── condition-validator.ts
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
