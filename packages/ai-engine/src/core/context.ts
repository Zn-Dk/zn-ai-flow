import type { WorkflowDefinition, WorkflowInput, WorkflowOutput } from '../types/workflow'

/**
 * 变量存储接口(TODO)
 */
export interface IVariableStore {
  /** 获取变量值 */
  get(nodeId: string, variableName: string): unknown
  /** 设置变量值 */
  set(nodeId: string, variableName: string, value: unknown): void

  /** 获取节点所有输出 */
  getNodeOutputs(nodeId: string): WorkflowOutput | undefined
  /** 设置节点所有输出 */
  setNodeOutputs(nodeId: string, outputs: WorkflowOutput): void
  // /** 获取所有变量（用于调试） */
  // getAll(): Map<string, WorkflowOutput>
}

// class VariableStore implements IVariableStore {
//   private store
// }


export type NodeStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'

/**
 * 执行上下文接口
 */
export interface IExecutionContext {
  // /** 执行ID */
  // readonly executionId: string
  // /** 工作流定义 */
  // readonly workflow: WorkflowDefinition
  // /** 变量存储 */
  // readonly variables: IVariableStore
  // /** 开始时间 */
  // readonly startTime: Date

  getInputs(): WorkflowInput

  // 输出读写
  setNodeOutputs(nodeId: string, outputs: WorkflowOutput): void
  getNodeOutputs(nodeId: string): WorkflowOutput | undefined
  getAllOutputs(): Record<string, WorkflowOutput>

  // 状态读写
  setNodeStatus(nodeId: string, status: NodeStatus): void
  getNodeStatus(nodeId: string): NodeStatus | undefined
}

export class ExecutionContext implements IExecutionContext {
  // start 入口的工作流输入
  private readonly inputs: WorkflowInput
  // 节点id - 输出 map
  private readonly nodeOutputMap = new Map<string, WorkflowOutput>()
  // 节点id - 状态 map
  private readonly nodeStatusMap = new Map<string, NodeStatus>()

  constructor(inputs: WorkflowInput) {
    this.inputs = inputs
  }

  getInputs() {
    return this.inputs
  }

  getNodeOutputs(nodeId: string) {
    return this.nodeOutputMap.get(nodeId)
  }

  setNodeOutputs(nodeId: string, outputs: WorkflowOutput) {
    this.nodeOutputMap.set(nodeId, outputs)
  }

  getAllOutputs() {
    return Object.fromEntries(this.nodeOutputMap)
  }

  getNodeStatus(nodeId: string) {
    return this.nodeStatusMap.get(nodeId)
  }

  setNodeStatus(nodeId: string, status: NodeStatus) {
    this.nodeStatusMap.set(nodeId, status)
  }

}
