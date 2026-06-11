import type { WorkflowDefinition, WorkflowNode } from '../types/workflow'

/**
 * 工作流执行图构建器
 * 职责: 根据工作流配置构建执行图
 * 1. 拓扑排序 (BFS 环检测)
 * 2. 节点依赖关系 （构建邻接表 adjacency list）
 * 3. 节点执行顺序
 * 4. 条件分支选择（`selectBranch`）：条件节点执行后，只保留匹配分支的后续节点
 * 基于Kahn拓扑排序
*/
export class GraphBuilder {
  /** 原始工作流 */
  private workflow: WorkflowDefinition
  /** 节点的正向邻接(后继节点id)表：nodeId → [后继节点] */
  private adjacencyList: Map<string, string[]> = new Map()
  /** 节点的反向邻接表：nodeId → [前驱节点] */
  private reverseAdjacencyList: Map<string, string[]> = new Map()
  /** 节点的入度表  nodeId → 入边数量*/
  private inDegree: Map<string, number> = new Map()
  /** 被排除的节点集合（条件分支裁剪） */
  private excludedNodes: Set<string> = new Set()

  constructor(workflow: WorkflowDefinition) {
    this.workflow = workflow
    this.buildGraph()
  }

  getInfo() {
    return {
      adjacencyList: this.adjacencyList,
      reverseAdjacencyList: this.reverseAdjacencyList,
      inDegree: this.inDegree,
      excludedNodes: this.excludedNodes,
    }
  }

  /** 构建图结构 */
  private buildGraph() {
    // 初始化节点
    for (const node of this.workflow.nodes) {
      this.adjacencyList.set(node.id, [])
      this.reverseAdjacencyList.set(node.id, [])
      this.inDegree.set(node.id, 0)
    }


    // 遍历边 填充邻接表+入度
    for (const edge of this.workflow.edges) {
      const { source, target } = edge

      // s-t 设置邻接表
      const sourceAdjacency = this.adjacencyList.get(source)!
      this.adjacencyList.set(source, [...sourceAdjacency, target])

      // 同时设置 t-s 的反向邻接表
      const targetRevAdjacency = this.reverseAdjacencyList.get(target)!
      this.reverseAdjacencyList.set(target, [...targetRevAdjacency, source])

      // target 入度+1
      const targetInDegree = this.inDegree.get(target)!
      this.inDegree.set(target, targetInDegree + 1)
    }
  }

  /** 获取节点执行顺序（BFS + Kahn拓扑排序） */
  getExecutionOrder() {
    const queue: string[] = [] // 队列(nodeId)
    const result: WorkflowNode[] = [] // 执行顺序

    // 创建副本
    const tmpIndegree = new Map(this.inDegree)
    // 1. 找到所有入度为 0 且未被排除的节点，放入队列
    tmpIndegree.forEach((degree, nodeId) => {
      if (degree === 0 && !this.excludedNodes.has(nodeId)) {
        queue.push(nodeId)
      }
    })

    // BFS 2-4
    while (queue.length > 0) {
      const headId = queue.shift()!
      // 跳过排除和访问节点
      if (this.excludedNodes.has(headId)) continue

      // 2 取出节点后加入结果
      const node = this.workflow.nodes.find(n => n.id === headId)
      if (!node) continue
      result.push(node)

      const successors = this.adjacencyList.get(headId) || []
      //  3. 将该节点的所有出边"删除"
      // 即遍历其所有的后驱节点, 入度 -1
      successors.forEach(s => {
        if (this.excludedNodes.has(s)) return

        const degree = tmpIndegree.get(s)!
        tmpIndegree.set(s, degree - 1)

        // 4.如果某个后继节点入度变为 0，加入队列
        if (degree - 1 === 0) {
          queue.push(s)
        }
      })
    }

    return result
  }

  /** 条件分支裁剪
   * @param condNodeId 条件节点ID
   * @param selectedBranch 选中的分支ID
   *  (edge.sourceHandle	这条边从条件节点的哪个端口出发	"branch_yes"、"branch_no")
   */
  selectBranch(condNodeId: string, selectedBranch: string) {
    // 所有出边
    const outEdges = this.workflow.edges.filter(e => e.source === condNodeId)
    outEdges.forEach(edge => {
      // 如果这条边的 sourceHandle 不是选中的分支 → 排除该分支
      if (edge.sourceHandle !== selectedBranch) {
        this.excludeSubtree(edge.target)
      }
    })
  }

  /** 排除子树(递归)
   * 条件节点执行后，只有一个分支被选中。未选中分支上的所有后续节点不应该执行。
   * 顺序:
   * 1 条件节点执行完成(e.g. 选择 yes)
   * 2 selectBranch 选择分支
   *   对 sourceHandle !== "yes" 的边，调用 excludeSubtree(edge.target)
   * 3 重新执行 getExecutionOrder
   * 4 得到只包含 yes 分支的执行顺序
   */
  private excludeSubtree(nodeId: string) {
    if (this.excludedNodes.has(nodeId)) return
    this.excludedNodes.add(nodeId)

    const successors = this.adjacencyList.get(nodeId)

    successors?.forEach(s => {
      // 遍历排除的子树节点的后驱节点, 检查他们的前驱
      const sPredecessors = this.reverseAdjacencyList.get(s) || []
      // 是否有活跃的入边
      const hasActiveInEdge = sPredecessors.some(p => !this.excludedNodes.has(p))
      // 如果没有活跃的入边, 说明它只依赖已排除分支，可继续递归排除该后继子图(认为是不执行的链路)
      if (!hasActiveInEdge) {
        this.excludeSubtree(s)
      }
    })
  }

  // --------------- UTILS

  /** 获得节点直接前驱 */
  getPredecessors(nodeId: string): string[] {
    return this.reverseAdjacencyList.get(nodeId) || []
  }

  // getAllPredecessors  TODO: 递归获得所有前驱节点

  /** 获得节点后驱 */
  getSuccessors(nodeId: string): string[] {
    return this.adjacencyList.get(nodeId) || []
  }

  /** 环检测 */
  hasCycle(): boolean {
    const visited = new Set<string>()
    const inStack = new Set<string>() // DFS 递归栈的节点

    // dfs 查找是否有环
    const hasCycleDfs = (nodeId: string): boolean => {
      // 3B. 跳过已访问节点(访问的节点其子树已经通过了 3A校验)
      if (visited.has(nodeId)) return false
      // 3A. 只要再次遇到, 即有环
      if (inStack.has(nodeId)) return true

      // 1.当前节点入栈 且记录已访问(提升性能)
      inStack.add(nodeId)
      visited.add(nodeId)

      // 2. 判断后驱节点 是否有环
      const successors = this.adjacencyList.get(nodeId) || []
      for (const s of successors) {
        if (hasCycleDfs(s)) return true
      }

      // 4. 无环, 回溯 (dfs 过程中, 逐层出栈)
      inStack.delete(nodeId)
      return false
    }

    for (const node of this.workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDfs(node.id)) return true
      }
    }

    return false
  }
}

export function createGraphBuilder(workflow: WorkflowDefinition) {
  return new GraphBuilder(workflow)
}

// ----------- MOCK -----------

// 假设工作流：

// Start → LLM → Condition ─(yes)→ HTTP → End
//                          ─(no)──→ End

const mockWorkflow: WorkflowDefinition = {
  nodes: [
    { id: 'nStart' },
    { id: 'nLLM' },
    { id: 'nCond' },
    { id: 'nHTTP' },
    { id: 'nEnd' },
  ],
  edges: [
    { source: 'nStart', target: 'nLLM' },
    { source: 'nLLM', target: 'nCond' },
    { source: 'nCond', target: 'nHTTP' },
    { source: 'nHTTP', target: 'nEnd' },
    { source: 'nCond', target: 'nEnd' },
  ],
} as WorkflowDefinition

const graphBuilder = new GraphBuilder(mockWorkflow)

console.log(graphBuilder.getInfo())
console.log(graphBuilder.getExecutionOrder())
