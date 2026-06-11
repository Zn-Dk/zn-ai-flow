import type { ExecutionLogEntry } from './logger'
import type { NodeType } from './node'

export type NodeData = {
  label?: string
  // 明确的类型由各节点的实际执行器约束
  config?: Record<string, unknown>
}

// 节点定义（对应前端 React Flow 的 Node 数据）
export interface WorkflowNode {
  id: string
  type: NodeType
  data: NodeData // 各类型节点的配置数据（联合类型）
  position: { x: number; y: number }
}

// 边定义
export interface WorkflowEdge {
  id: string
  source: string // 源节点 ID
  target: string // 目标节点 ID
  sourceHandle?: string // 条件分支的输出端口
}

// 工作流定义
export interface WorkflowDefinition {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

/**
 * 工作流执行输入
 */
export type WorkflowInput = Record<string, unknown>

/**
 * 工作流执行输出
 */
export type WorkflowOutput = Record<string, unknown>

// 工作流执行结果
export interface WorkflowExecutionResult {
  success: boolean
  outputs: Record<string, unknown>
  logs: ExecutionLogEntry[]
  duration: number
  error?: { message: string; nodeId?: string }
}