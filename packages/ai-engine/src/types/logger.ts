import type { NodeExecutionResult, NodeType } from './node'

/**
 * 日志级别
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

/**
 * 日志阶段
 */
export type LogPhase =
  | 'workflow:start'
  | 'workflow:end'
  | 'node:start'
  | 'node:end'
  | 'variable:resolve'
  | 'llm:request'
  | 'llm:response'
  | 'http:request'
  | 'http:response'

/** 日志项 */
export interface ExecutionLogEntry {
  timestamp: number
  level: LogLevel
  nodeId?: string
  phase: LogPhase
  message: string
  data?: Record<string, unknown>
  duration?: number
}

type LogMethodParam = [
  phase: LogPhase,
  message: string,
  nodeId?: string,
  data?: Record<string, unknown>
]

export interface ExecutionLogger {
  info(...args: LogMethodParam): void
  warn(...args: LogMethodParam): void
  error(...args: LogMethodParam): void
  debug(...args: LogMethodParam): void

  // ------- 专属事件

  /**
   * 记录节点开始执行事件
   */
  nodeStart(nodeId: string, type: NodeType, config: unknown): void

  /**
   * 记录节点执行结束事件
   */
  nodeEnd(nodeId: string, result: NodeExecutionResult): void

  /**
   * 记录变量模板解析事件
   *
   * - `templateText`：完整模板文本，通常来自节点配置原值
   * - `resolvedValue`：最终解析得到的值
   *
   * Example:
   * - `templateText = "结果：{{llm_1.output}}"`
   * - `resolvedValue = "你好"`
   */
  variableTemplateResolved(
    templateText: string,
    resolvedValue: unknown,
  ): void
}
