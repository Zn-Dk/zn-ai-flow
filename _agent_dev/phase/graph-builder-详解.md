# GraphBuilder 图构建器 — 源码深度解析

> 基于 `miaoma-aiflow/packages/ai-engine/src/core/graph-builder.ts`（208 行）
> 本文档详细解释每一段逻辑的意图和算法原理

---

## 一、整体职责

GraphBuilder 是工作流引擎的“调度大脑”，负责：

**最小实现（Phase 1）：**

1. **构建图结构**：将 nodes + edges 转化为邻接表表示
2. **拓扑排序**：确定节点的合法执行顺序（Kahn 算法）

**进阶功能（Phase 2）：** 3. **分支裁剪**：条件节点执行后，排除未选中分支的后续节点4. **上游查询**：查找某个节点的所有前驱节点（用于变量解析）

---

## 二、数据结构

> 最小实现只需要 `adjacencyList` + `inDegree`，即可完成拓扑排序。
> `[Phase 2]` 标注的结构用于条件分支裁剪和上游查询，初次学习可跳过。

```ts
class GraphBuilder {
  private workflow: WorkflowDefinition // 原始工作流定义
  private adjacencyList: Map<string, string[]> // 正向邻接表：nodeId → [后继节点]
  private inDegree: Map<string, number> // 入度表：nodeId → 入边数量
  // [Phase 2] private reverseAdjacencyList: Map<string, string[]> // 反向邻接表：nodeId → [前驱节点]
  // [Phase 2] private excludedNodes: Set<string> // 被排除的节点集合（条件分支裁剪）
}
```

### 为什么需要这些数据结构？

**最小实现（Phase 1）：**

| 数据结构        | 用途                     | 使用场景                           |
| --------------- | ------------------------ | ---------------------------------- |
| `adjacencyList` | 知道每个节点的后继是谁   | 拓扑排序时更新后继入度             |
| `inDegree`      | 记录每个节点有多少条入边 | Kahn 算法的核心——入度为 0 可以执行 |

**扩展结构（Phase 2 — 条件分支裁剪 & 上游查询）：**

| 数据结构               | 用途                   | 使用场景                                                       |
| ---------------------- | ---------------------- | -------------------------------------------------------------- |
| `reverseAdjacencyList` | 知道每个节点的前驱是谁 | 变量解析时查找上游输出、分支裁剪时判断节点是否还有其他活跃入边 |
| `excludedNodes`        | 记录被裁剪掉的节点     | 条件分支选择后，未选中路径上的节点不执行                       |

---

## 三、buildGraph() — 构建图结构

> 注释部分为 Phase 2 才需要的逻辑，初次学习可忽略。

```ts
private buildGraph(): void {
  // 第一步：初始化所有节点
  for (const node of this.workflow.nodes) {
    this.adjacencyList.set(node.id, [])        // 每个节点初始没有后继
    // [Phase 2] this.reverseAdjacencyList.set(node.id, []) // 每个节点初始没有前驱
    this.inDegree.set(node.id, 0)              // 每个节点初始入度为 0
  }

  // 第二步：根据边建立关系
  for (const edge of this.workflow.edges) {
    // 正向：source → target
    const targets = this.adjacencyList.get(edge.source) || []
    targets.push(edge.target)
    this.adjacencyList.set(edge.source, targets)

    // [Phase 2] 反向：target ← source
    // const sources = this.reverseAdjacencyList.get(edge.target) || []
    // sources.push(edge.source)
    // this.reverseAdjacencyList.set(edge.target, sources)

    // 入度：target 的入度 +1
    const degree = this.inDegree.get(edge.target) || 0
    this.inDegree.set(edge.target, degree + 1)
  }
}
```

### 图示例

假设工作流：

```
Start → LLM → Condition ─(yes)→ HTTP → End
                         ─(no)──→ End
```

构建后的数据结构（最小实现）：

```
adjacencyList:
  start    → [llm]
  llm      → [condition]
  condition → [http, end]     // 两条出边（yes/no 分支）
  http     → [end]
  end      → []

inDegree:
  start: 0, llm: 1, condition: 1, http: 1, end: 2
```

<details>
<summary>[Phase 2] 反向邻接表（点击展开）</summary>

```
reverseAdjacencyList:
  start    → []
  llm      → [start]
  condition → [llm]
  http     → [condition]
  end      → [condition, http]  // 两条入边（来自 condition 的 no 分支 + http）
```

用途：`selectBranch` 裁剪时判断节点是否还有其他活跃入边；`getUpstreamNodes` 查询上游。

</details>

---

## 四、getExecutionOrder() — Kahn 拓扑排序

> 📚 **学习路线**：本章分为两个 Phase：
>
> - [Phase 1：最小实现](#phase1-小结) — 纯 Kahn 算法，适合初次学习
> - [Phase 2：完整实现（含分支裁剪）](#phase-2完整实现含条件分支裁剪) — 加入 `excludedNodes` 判断

### 什么是拓扑排序？

对于有向无环图（DAG），拓扑排序是一种线性排列，使得对于每条边 `u → v`，`u` 一定排在 `v` 前面。

**直觉理解**：如果 A 依赖 B 的输出，那么 B 必须在 A 之前执行。拓扑排序就是找到一个满足所有依赖关系的执行顺序。

### Kahn 算法步骤

```
1. 找到所有入度为 0 的节点，放入队列
2. 从队列取出一个节点，加入结果
3. 将该节点的所有出边"删除"（后继节点入度 -1）
4. 如果某个后继节点入度变为 0，加入队列
5. 重复 2-4，直到队列为空
```

### 源码逐行解析（最小实现）

> 注释部分为 Phase 2（条件分支裁剪）才需要的逻辑，初次学习可忽略。
> 在纯线性工作流中，`excludedNodes` 为空集，所有相关判断等价于 `false`，不影响结果。

```ts
getExecutionOrder(): WorkflowNode[] {
  const result: WorkflowNode[] = []
  const queue: string[] = []

  // ① 创建入度副本（不修改原始数据，因为可能多次调用）
  const inDegreeCopy = new Map(this.inDegree)

  // ② 找到所有入度为 0 的节点（通常只有 Start 节点）
  for (const [nodeId, degree] of inDegreeCopy) {
    if (degree === 0) {
      // [Phase 2] 加入排除判断: && !this.excludedNodes.has(nodeId)
      queue.push(nodeId)
    }
  }

  // ③ BFS 主循环
  while (queue.length > 0) {
    const nodeId = queue.shift()!  // 取出队首

    // [Phase 2] 跳过已排除的节点
    // if (this.excludedNodes.has(nodeId)) continue

    // 将节点加入结果
    const node = this.workflow.nodes.find(n => n.id === nodeId)
    if (node) {
      result.push(node)
    }

    // ④ "删除"出边：后继节点入度 -1
    const successors = this.adjacencyList.get(nodeId) || []
    for (const successor of successors) {
      // [Phase 2] 跳过已排除节点: if (this.excludedNodes.has(successor)) continue

      const degree = inDegreeCopy.get(successor)! - 1
      inDegreeCopy.set(successor, degree)

      // ⑤ 入度变为 0 → 可以执行了，加入队列
      if (degree === 0) {
        queue.push(successor)
      }
    }
  }

  return result
}
```

### 用上面的例子走一遍

初始状态：`inDegree = { start: 0, llm: 1, condition: 1, http: 1, end: 2 }`

| 步骤 | 队列    | 取出      | 操作                              | 结果                               |
| ---- | ------- | --------- | --------------------------------- | ---------------------------------- |
| 初始 | [start] | -         | start 入度为 0                    | -                                  |
| 1    | []      | start     | llm 入度 1→0，入队                | [start]                            |
| 2    | []      | llm       | condition 入度 1→0，入队          | [start, llm]                       |
| 3    | []      | condition | http 入度 1→0，入队；end 入度 2→1 | [start, llm, condition]            |
| 4    | []      | http      | end 入度 1→0，入队                | [start, llm, condition, http]      |
| 5    | []      | end       | 无后继                            | [start, llm, condition, http, end] |

最终执行顺序：`start → llm → condition → http → end` ✅

### 为什么用 Kahn 而不是 DFS 拓扑排序？

| 特性               | Kahn（BFS）                            | DFS 后序反转              |
| ------------------ | -------------------------------------- | ------------------------- |
| 环检测             | 天然支持（排序后节点数 < 总数 = 有环） | 需要额外的 `inStack` 标记 |
| 直觉性             | 更直观——"没有依赖的先执行"             | 需要理解"后序反转"        |
| [Phase 2] 动态裁剪 | 容易配合 `excludedNodes` 做分支裁剪    | 需要额外处理              |
| 多起点             | 天然支持（所有入度 0 的节点都入队）    | 需要遍历所有未访问节点    |

miaoma 选择 Kahn 是因为它与"条件分支动态裁剪"（Phase 2）配合最自然。

### 为什么用入度副本？

```ts
const inDegreeCopy = new Map(this.inDegree)
```

因为 `getExecutionOrder()` 可能被多次调用（每次 `selectBranch` 后需要重新获取剩余执行顺序）。如果直接修改 `this.inDegree`，第二次调用就会得到错误结果。

### 为什么只需要入度，不需要出度？

**入度回答的是"我还有几个前置依赖没完成？"，而出度回答的是"我完成后能解锁谁？"——前者决定"何时可以执行"，后者通过邻接表已经隐含了。**

把每个节点想象成一门课程：

- **入度 = 这门课有几门先修课**（前置依赖数量）
- **出度 = 修完这门课后能解锁几门新课**（后续依赖数量）

Kahn 算法的核心问题是：**"现在哪些节点可以执行？"** —— 答案是"所有前置依赖都已完成的节点"，即**入度为 0** 的节点。

出度不需要单独维护，因为：

```
当节点 A 执行完毕后，需要通知它的后继节点"你的一个前置依赖完成了"
→ "通知谁"的信息 = adjacencyList[A]（邻接表）
→ 通知的动作 = 后继节点入度 -1
```

**邻接表本身就隐含了出度信息**（`adjacencyList.get(nodeId).length` 就是出度），不需要额外维护一个 `outDegree` 数值变量。

|                            | 入度 (inDegree)                 | 出度 / 邻接表 (adjacencyList) |
| -------------------------- | ------------------------------- | ----------------------------- |
| **语义**                   | "我还差几个依赖才能执行"        | "我执行完后能解锁谁"          |
| **是否需要动态更新**       | ✅ 每次有前驱完成就 -1          | ❌ 图结构不变，不需要更新     |
| **决定什么**               | 节点何时入队（入度=0 → 可执行） | 节点完成后更新谁的入度        |
| **是否需要单独的数值变量** | ✅ 需要 `Map<string, number>`   | ❌ 邻接表的数组长度就是出度   |

**如果硬要用出度呢？** 理论上可以用"出度"做反向拓扑排序（从终点往起点排），但那就是 DFS 后序遍历的思路——先找到出度为 0 的节点（终点），然后反向推导。这种方式不直观（人类思维是"从起点开始执行"），也不方便动态裁剪分支。

---

### Phase 1 小结

至此，你已经掌握了 Kahn 拓扑排序的核心原理：

1. **入度为 0 的节点先执行** — 这是拓扑排序的直觉基础
2. **BFS 逐层解锁** — 一个节点完成后，它的后继入度 -1，归零则入队
3. **入度副本** — 保证多次调用 `getExecutionOrder()` 结果一致

> ✅ **验证方法**：用线性工作流（`Start → A → B → End`）测试，确认执行顺序正确。

---

### Phase 2：完整实现（含条件分支裁剪）

> 📌 **前置知识**：请先完成 [第五章 selectBranch()](#五selectbranch-条件分支裁剪-phase-2) 和 [第六章 excludeSubtree()](#六excludesubtree-递归排除子树-phase-2) 的学习，了解 `excludedNodes` 是如何被填充的。

在 Phase 1 中，我们假设工作流是**线性无分支**的。但实际工作流存在条件分支，某些节点在执行时已经被 `excludeSubtree()` 排除了。Phase 2 就是在 Kahn 算法中**正确处理这些被排除的节点**。

#### 需要补充的逻辑

回顾 Phase 1 的代码，有三处与 `excludedNodes` 相关的判断：

```ts
getExecutionOrder(): WorkflowNode[] {
  // ...

  // ① 初始化：只将「入度为 0 且未被排除」的节点入队
  tmpIndegree.forEach((degree, nodeId) => {
    if (degree === 0 && !this.excludedNodes.has(nodeId)) {
      queue.push(nodeId)
    }
  })

  while (queue.length > 0) {
    const headId = queue.shift()!
    // ...

    // ② 遍历后继时：跳过已排除的后继节点
    successors.forEach(s => {
      if (this.excludedNodes.has(s)) return  // ← 新增

      const degree = tmpIndegree.get(s)!
      tmpIndegree.set(s, degree - 1)

      if (degree - 1 === 0) {
        queue.push(s)
      }
    })
  }
}
```

#### 为什么要判断？逐行解析

| 位置       | 判断                               | 原因                                                                                                                 |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ① 初始化   | `!this.excludedNodes.has(nodeId)`  | 被排除的节点不应作为 BFS 起点。例如 `no` 分支的起始节点入度为 0，但它不应该被执行。                                  |
| ② 后继遍历 | `if (excludedNodes.has(s)) return` | 防止对已排除的节点进行入度操作。虽然该节点的入度可能永远不会归零（因为前驱已被排除），但防御性判断可以避免意外行为。 |
| ③ 入队前   | `!this.excludedNodes.has(s)`       | **关键**：即使 `s` 的入度在副本中归零了，如果 `s` 已被排除，也不应该入队。                                           |

#### 为什么 while 头部不需要判断？

在 Phase 1 的注释中，有一段被注释掉的逻辑：

```ts
// if (this.excludedNodes.has(headId) || visited.has(headId)) continue
```

**这段逻辑是多余的**，原因：

1. **`excludedNodes.has(headId)` 不可能为 true**：如果 `headId` 被排除了，它的入度不可能通过活跃节点归零（因为 `excludeSubtree` 的递归逻辑保证了被排除节点的所有前驱都已被排除）。所以被排除的节点永远不会入队。

2. **`visited` 集合不需要**：Kahn 算法天然保证每个节点只入队一次（入度归零只有一次），不需要额外的 `visited` 来去重。

#### 完整代码（Phase 2）

```ts
getExecutionOrder(): WorkflowNode[] {
  const queue: string[] = []
  const result: WorkflowNode[] = []

  // 创建入度副本
  const tmpIndegree = new Map(this.inDegree)

  // ① 初始化：入度为 0 且未被排除的节点入队
  tmpIndegree.forEach((degree, nodeId) => {
    if (degree === 0 && !this.excludedNodes.has(nodeId)) {
      queue.push(nodeId)
    }
  })

  // BFS
  while (queue.length > 0) {
    const headId = queue.shift()!

    // 加入结果
    const node = this.workflow.nodes.find(n => n.id === headId)
    if (!node) continue
    result.push(node)

    // 遍历后继
    const successors = this.adjacencyList.get(headId) || []
    successors.forEach(s => {
      // ② 跳过已排除的后继
      if (this.excludedNodes.has(s)) return

      const degree = tmpIndegree.get(s)!
      tmpIndegree.set(s, degree - 1)

      // ③ 入度归零且未被排除 → 入队
      if (degree - 1 === 0 && !this.excludedNodes.has(s)) {
        queue.push(s)
      }
    })
  }

  return result
}
```

#### 走一遍带分支的例子

工作流：

```
Start → Condition ─(yes)→ HTTP → End
                 ─(no)──→ End
```

假设 `selectBranch(condId, "yes")` 已执行，`no` 分支的 End 被排除。

> 注：实际代码中 End 是同一个节点（分支汇聚），此时 `excludeSubtree` **不会**排除 End，因为 End 还有来自 HTTP 的活跃入边。

执行顺序：

| 步骤 | 队列    | 取出      | 操作                                            | 结果                          |
| ---- | ------- | --------- | ----------------------------------------------- | ----------------------------- |
| 初始 | [start] | -         | start 入度为 0                                  | -                             |
| 1    | []      | start     | condition 入度 1→0                              | [start]                       |
| 2    | []      | condition | http 入度 1→0；end 入度 2→1（还有一条活跃入边） | [start, condition]            |
| 3    | []      | http      | end 入度 1→0                                    | [start, condition, http]      |
| 4    | []      | end       | 无后继                                          | [start, condition, http, end] |

最终顺序：`start → condition → http → end` ✅（`no` 分支被正确跳过）

---

## 五、selectBranch() — 条件分支裁剪 [Phase 2]

> ℹ️ 以下内容属于 Phase 2 进阶功能，依赖 `reverseAdjacencyList` 和 `excludedNodes`。
> 建议在完成第四章最小实现并验证通过后再学习。

### 场景

条件节点执行后，只有一个分支被选中。未选中分支上的所有后续节点不应该执行。

```ts
selectBranch(conditionNodeId: string, selectedBranchId: string): void {
  // 找到条件节点的所有出边
  const edges = this.workflow.edges.filter(e => e.source === conditionNodeId)

  for (const edge of edges) {
    // 如果这条边的 sourceHandle 不是选中的分支 → 排除该分支
    if (edge.sourceHandle !== selectedBranchId) {
      this.excludeSubtree(edge.target)
    }
  }
}
```

### sourceHandle 是什么？

在 React Flow 中，一个节点可以有多个输出端口（Handle）。条件节点的每个分支对应一个 Handle：

```
Condition 节点
  ├── sourceHandle: "branch_yes" → HTTP 节点
  └── sourceHandle: "branch_no"  → End 节点
```

> 对 antv x6 的使用者来说 类似节点桩（port）

当条件判断结果为 `"branch_yes"` 时，调用 `selectBranch(conditionId, "branch_yes")`，会排除 `"branch_no"` 分支的后续节点。

---

## 六、excludeSubtree() — 递归排除子树 [Phase 2]

### 为什么要排除子树？

这是理解 `excludeSubtree` 的**核心动机**——

**问题场景**：条件节点执行后，只有**一个分支**应该继续执行，其他分支应该被"剪掉"。

```
Start → Condition ─(yes)→ HTTP → End
                ─(no)──→ End（这个分支不应该执行）
```

如果条件判断结果为 `yes`，那么 `no` 分支上的所有节点（包括 End）都应该从执行顺序中移除。

**如果不排除会怎样？**

Kahn 算法会把**所有节点**都加入执行顺序（因为它只关心 DAG 的拓扑关系，不关心条件分支的选择）。结果就是：

- `no` 分支的节点也会被"执行"（即使条件不满足）
- 或者引擎需要额外判断每个节点是否在活跃分支上，增加复杂度

**正确做法**：

```
条件节点执行完毕
    ↓
引擎调用 selectBranch(condId, "yes")
    ↓
selectBranch 内部：遍历条件节点的所有出边，
对 sourceHandle !== "yes" 的边，调用 excludeSubtree(edge.target)
    ↓
excludeSubtree 递归排除该分支的整个下游子树
    ↓
重新调用 getExecutionOrder()
    ↓
得到只包含 yes 分支的执行顺序 ✅
```

**两者的关系**：

- `selectBranch`：入口方法，负责找出"哪些分支不走"
- `excludeSubtree`：执行方法，负责递归排除某个分支的所有下游节点

> ⚠️ **简化实现的问题**：`selectBranch` 如果只做 `this.excludedNodes.add(edge.target)`（仅排除直接子节点），没有调用 `excludeSubtree` 递归排除整个子树。这在分支下游只有一层节点时够用，但如果分支下游有多层节点链（如 `A → B → C`），就需要升级为调用 `excludeSubtree` 才能正确排除整条链。

---

### 源码解析

这是最精妙的部分：

```ts
private excludeSubtree(nodeId: string): void {
  // 已经排除过了，跳过（防止重复递归）
  if (this.excludedNodes.has(nodeId)) return

  // 标记为排除
  this.excludedNodes.add(nodeId)

  // 递归处理后继节点
  const successors = this.adjacencyList.get(nodeId) || []
  for (const successor of successors) {
    // 🔑 关键判断：后继节点是否还有其他"活跃"的入边？
    const predecessors = this.reverseAdjacencyList.get(successor) || []
    const hasActiveInEdge = predecessors.some(p => !this.excludedNodes.has(p))

    // 只有当所有入边都被排除时，才排除这个后继节点
    if (!hasActiveInEdge) {
      this.excludeSubtree(successor)
    }
  }
}
```

### 为什么不能无脑递归排除所有后继？

考虑这个场景（**分支汇聚**）：

```
         ┌─(yes)→ HTTP ─┐
Start → Condition        ├→ End
         └─(no)──────────┘
```

如果条件选中 `yes` 分支，要排除 `no` 分支。`no` 分支直接连到 End 节点。

**如果无脑排除**：End 节点也会被排除 → 工作流没有输出 ❌

**正确做法**：检查 End 节点是否还有其他活跃入边（来自 HTTP 节点的边）。如果有，就不排除 End。

```
End 的前驱：[condition(已排除 no 分支), http(活跃)]
hasActiveInEdge = true → 不排除 End ✅
```

### 这就是为什么需要 reverseAdjacencyList

`reverseAdjacencyList` 让我们能快速查到"谁指向了这个节点"，从而判断该节点是否还有其他活跃的入边。没有反向邻接表，就需要遍历所有边来查找，效率低下。

---

## 七、hasCycle() — 环检测

```ts
hasCycle(): boolean {
  const visited = new Set<string>()
  const inStack = new Set<string>()  // 当前 DFS 路径上的节点

  const dfs = (nodeId: string): boolean => {
    // 如果在当前路径上再次遇到 → 有环
    if (inStack.has(nodeId)) return true
    // 如果之前已经完整探索过 → 无环
    if (visited.has(nodeId)) return false

    visited.add(nodeId)
    inStack.add(nodeId)  // 进入当前路径

    const successors = this.adjacencyList.get(nodeId) || []
    for (const successor of successors) {
      if (dfs(successor)) return true  // 发现环，立即返回
    }

    inStack.delete(nodeId)  // 离开当前路径（回溯）
    return false
  }

  // 从每个未访问的节点开始 DFS（处理不连通图）
  for (const node of this.workflow.nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true
    }
  }

  return false
}
```

### 为什么不用 Kahn 算法检测环？

前面说过 Kahn 天然支持环检测（排序后节点数 < 总数 = 有环）。但 miaoma 选择了 DFS 方式，原因可能是：

1. **`hasCycle()` 是独立的校验方法**：在 `WorkflowValidator` 中调用，不依赖 `getExecutionOrder()` 的结果
2. **职责分离**：`getExecutionOrder()` 负责排序，`hasCycle()` 负责校验，互不耦合
3. **DFS 环检测更经典**：面试中更常考的写法

### DFS 环检测原理

核心思想：如果在一条 DFS 路径上，再次遇到了已经在路径中的节点，说明存在环。

```
visited：全局已探索过的节点（不会重复探索）
inStack：当前 DFS 递归栈中的节点（只在当前路径上）

区别：
- visited 的节点可能在其他路径上，不代表有环
- inStack 的节点一定在当前路径上，再次遇到 = 环
```

图示：

```
A → B →  C   →   D
         ↑       ↓
         └───────┘   ← 环！

DFS 路径：A → B → C → D → C（inStack 中已有 C）→ 发现环！
```

### 💡 常见疑问

#### Q1：`visited` 判断（L178）是指什么状况可以放心跳过？

```ts
if (visited.has(nodeId)) return false
```

**含义**：这个节点我之前已经完整探索过了，它的所有后继我都已经确认过没有环，不需要再走一遍。

**触发场景**：考虑这个 DAG（无环）：

```
    A
   / \
  B   C
   \ /
    D
```

执行路径：

1. `dfs(A)` → 先走 `B` 分支 → `dfs(B)` → `dfs(D)` → `D` 的所有后继探索完，`D` 加入 `visited`
2. 回溯到 `A`，再走 `C` 分支 → `dfs(C)` → 到达 `D`
3. **此时 `visited.has('D')` 为 `true`** → 直接 `return false`，不重复探索 `D` 的子树

**为什么可以放心跳过？**

因为 `visited` 的含义是：**这个节点的整个子树已经确认无环**。

- 如果 `D` 的子树里有环，早在第一次探索 `D` 时就已经返回 `true` 了
- 既然第一次探索 `D` 返回了 `false`（无环），第二次再遇到 `D` 时，结果不会变

> 📌 **没有 `visited` 会怎样？** 正确性不受影响，但 `D` 的子树会被重复探索，在复杂 DAG 里会退化成指数级。

---

#### Q2：无环的回溯机制是怎么样的？

以这个图为例（无环）：

```
nStart → nLLM → nCond → nHTTP → nEnd
                    └────────────→ nEnd
```

**执行过程逐步拆解**：

| 步骤 | 操作                                                                 | `inStack`               | `visited`        |
| ---- | -------------------------------------------------------------------- | ----------------------- | ---------------- |
| 1    | 调用 `dfs(nStart)`                                                   | `{nStart}`              | `{nStart}`       |
| 2    | 进入 `nLLM`                                                          | `{nStart, nLLM}`        | `{nStart, nLLM}` |
| 3    | 进入 `nCond`                                                         | `{nStart, nLLM, nCond}` | `{..., nCond}`   |
| 4    | 进入 `nHTTP`（ Cond 的第一个后继）                                   | `+ nHTTP`               | `+ nHTTP`        |
| 5    | 进入 `nEnd`                                                          | `+ nEnd`                | `+ nEnd`         |
| 6    | `nEnd` 无后继，**回溯**，`inStack.delete(nEnd)`                      | `- nEnd`                | 不变             |
| 7    | `nHTTP` 探索完，**回溯**                                             | `- nHTTP`               | 不变             |
| 8    | `nCond` 继续检查第二个后继 `nEnd` → `visited.has(nEnd)` = true，跳过 | 不变                    | 不变             |
| 9    | `nCond` 探索完，**回溯**                                             | `- nCond`               | 不变             |
| 10   | `nLLM` 探索完，**回溯**                                              | `- nLLM`                | 不变             |
| 11   | `nStart` 探索完，**回溯**                                            | `{}` 为空               | 不变             |

**最终**：`inStack` 为空，`visited` 包含所有节点，返回 `false`（无环）✅

**关键区别**：

- `visited.has(x)` = true → 这个节点**之前探索过，无环，放心跳过**
- `inStack.has(x)` = true → 这个节点**当前正在探索路径上，又回来了，有环！**

---

#### Q3：去掉 `visited` 会有什么问题？

**结论**：会退化成指数级重复搜索，但**不会漏报环**（正确性不受影响）。

**对比**：

| 项目       | 有 `visited` | 无 `visited` |
| ---------- | ------------ | ------------ |
| 正确性     | ✅           | ✅           |
| 时间复杂度 | O(N + E)     | 可能指数级   |
| 是否需要   | 工程必须     | 教学演示可省 |

**最坏情况**：20 层的满二叉树 DAG，无 `visited` 时接近 O(2^N)。

---

#### Q4：`hasCycle` 入口的 `if (!visited.has(node.id))` 是不是多余的？

**结论**：功能上**接近多余**（DFS 内部已有 `visited` 判断），但**工程上不多余**。

##### 功能角度：确实多余

```ts
// hasCycle 的入口循环
for (const node of this.workflow.nodes) {
  if (!visited.has(node.id)) {
    // ← 这个判断
    if (dfs(node.id)) return true
  }
}
```

如果去掉这个判断，直接写：

```ts
for (const node of this.workflow.nodes) {
  if (dfs(node.id)) return true // 没有 !visited.has 判断
}
```

**功能正确性不受影响**，因为 `dfs` 内部已经处理了：

```ts
const dfs = (nodeId: string): boolean => {
  if (inStack.has(nodeId)) return true
  if (visited.has(nodeId)) return false // ← 内部已经跳过已探索节点
  // ...
}
```

##### 工程角度：不多余，处理**不连通图**

工作流图通常是连通的（所有节点通过边相连），此时入口判断确实多余。

但 `hasCycle()` 是一个**通用方法**，应该能处理**不连通图**：

```
图中有两个独立的子图：

子图1：A → B → C
子图2：D → E → F
（A/B/C 和 D/E/F 之间没有任何边相连）
```

**有入口判断时**：

| 循环次数 | node.id | `!visited.has()` | 行为                                |
| -------- | ------- | ---------------- | ----------------------------------- |
| 1        | A       | true             | `dfs(A)` → 覆盖 A/B/C，加入 visited |
| 2        | B       | false            | **跳过** ✅                         |
| 3        | C       | false            | **跳过** ✅                         |
| 4        | D       | true             | `dfs(D)` → 覆盖 D/E/F，加入 visited |
| 5        | E       | false            | **跳过** ✅                         |
| 6        | F       | false            | **跳过** ✅                         |

**无入口判断时**（功能正确但低效）：

| 循环次数 | node.id | `dfs` 内部行为                             | 结果          |
| -------- | ------- | ------------------------------------------ | ------------- |
| 1        | A       | 正常执行，覆盖 A/B/C                       | ✅            |
| 2        | B       | `visited.has(B)` = true，直接 return false | ✅ 但白跑一趟 |
| 3        | C       | 同理白跑                                   | ✅ 但白跑     |
| 4        | D       | 正常执行，覆盖 D/E/F                       | ✅            |
| 5        | E       | 白跑                                       | ✅ 但白跑     |
| 6        | F       | 白跑                                       | ✅ 但白跑     |

##### 一句话总结

> 入口的 `if (!visited.has(node.id))` **防御的是"不连通图"场景下对每个节点都触发 DFS 的性能浪费**。
>
> - 功能正确性：多余（`dfs` 内部已处理）
> - 性能：不多余（避免对已被覆盖的节点重复调用 DFS）
> - 代码意图：不多余（显式表达"只从每个未探索的节点出发一次"，可读性更好）
>
> 如果图一定是连通的（工作流通常如此），可以省略，但保留是更鲁棒的做法。

---

## 八、getUpstreamNodes / getAllUpstreamNodes — 上游查询 [Phase 2]

```ts
// 直接前驱（一层）
getUpstreamNodes(nodeId: string): string[] {
  return this.reverseAdjacencyList.get(nodeId) || []
}

// 所有前驱（递归，DFS）
getAllUpstreamNodes(nodeId: string): string[] {
  const result = new Set<string>()
  const visited = new Set<string>()

  const dfs = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)

    const predecessors = this.reverseAdjacencyList.get(id) || []
    for (const pred of predecessors) {
      result.add(pred)
      dfs(pred)
    }
  }

  dfs(nodeId)
  return Array.from(result)
}
```

### 用途

**变量解析时**：当节点 C 的配置中引用了 `{{A.output}}`，引擎需要验证 A 确实是 C 的上游节点（否则 A 可能还没执行，变量值不存在）。

- `getUpstreamNodes`：只看直接前驱（快速查询）
- `getAllUpstreamNodes`：看所有可达的前驱（完整校验）

---

## 九、createGraphBuilder() — 工厂函数

```ts
export function createGraphBuilder(workflow: WorkflowDefinition): GraphBuilder {
  return new GraphBuilder(workflow)
}
```

为什么要导出工厂函数而不是直接 `new GraphBuilder()`？

1. **封装构造细节**：未来如果构造逻辑变复杂（如加缓存、加校验），只需改工厂函数
2. **API 一致性**：与 `createWorkflowEngine()` 等其他工厂函数风格统一
3. **测试友好**：可以 mock 工厂函数返回测试用的 GraphBuilder

---

## 十、完整执行流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowEngine.execute()                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. const graph = new GraphBuilder(workflow)                  │
│     └── buildGraph() 自动执行                                │
│         └── 构建 adjacencyList + reverseAdjacencyList        │
│             + inDegree                                       │
│                                                              │
│  2. let order = graph.getExecutionOrder()                    │
│     └── Kahn 拓扑排序 → [start, llm, condition, ...]        │
│                                                              │
│  3. for (node of order):                                     │
│       │                                                      │
│       ├── 普通节点：执行 → 记录输出 → 继续                   │
│       │                                                      │
│       └── 条件节点：执行 → 得到 selectedBranch               │
│             │                                                │
│             ├── graph.selectBranch(nodeId, selectedBranch)    │
│             │   └── excludeSubtree(未选中分支的目标节点)      │
│             │       └── 递归排除（但保留有其他活跃入边的节点）│
│             │                                                │
│             └── order = graph.getExecutionOrder()             │
│                 └── 重新排序（跳过 excludedNodes）            │
│                                                              │
│  4. 收集 End 节点输出 → 返回结果                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 十一、面试考点

1. **Kahn 算法 vs DFS 拓扑排序**：各自优缺点、时间复杂度 O(V+E)
2. **为什么需要反向邻接表**：分支裁剪时判断节点是否还有活跃入边
3. **分支汇聚问题**：不能无脑递归排除，需要检查其他入边
4. **入度副本**：为什么不能直接修改原始入度表
5. **DFS 环检测**：`visited` vs `inStack` 的区别

---

## 十二、实现建议

你在 `zn-ai-flow` 中实现时，建议按以下顺序：

1. **先实现 `buildGraph()`** — 最基础，构建数据结构
2. **再实现 `getExecutionOrder()`** — Kahn 算法，可以用简单的线性工作流测试
3. **然后实现 `hasCycle()`** — DFS 环检测，独立功能
4. **接着实现 `getUpstreamNodes()` / `getAllUpstreamNodes()`** — 简单的查询方法
5. **最后实现 `selectBranch()` + `excludeSubtree()`** — 最复杂，需要条件节点配合测试

每一步都可以独立验证，不需要等其他组件就绪。
