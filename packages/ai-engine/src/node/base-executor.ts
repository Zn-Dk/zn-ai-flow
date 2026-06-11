import type { IExecutionContext } from '../core/context'
import { VariableResolver } from '../core/variable-resolver'
import type { ExecutionLogger, NodeExecutionResult, NodeType } from '../types'

export type ExecuteFnArgs<TConfig = Record<string, unknown>> = [
  nodeId: string,
  config: TConfig,
  context: IExecutionContext,
  logger: ExecutionLogger,
]

export interface INodeExecutor<TConfig = Record<string, unknown>> {
  readonly type: NodeType
  // 基类实现(相当于wrapper)：统一处理计时、异常兜底、输出回写
  execute(...args: ExecuteFnArgs<TConfig>): Promise<NodeExecutionResult>

  // 未来实现
  validate?(config: TConfig): { valid: boolean; errors?: string[] }
  // 节点输出
  // getOutputSchema?(config: TConfig): OutputVariableSchema[]
}

export abstract class BaseNodeExecutor<TConfig = Record<string, unknown>>
implements INodeExecutor<TConfig> {
  abstract readonly type: NodeType

  // 子类实现：在基类wrapper execute内部, 只需关注业务逻辑
  protected abstract doExecute(...args: ExecuteFnArgs<TConfig>): Promise<NodeExecutionResult>

  // 基类实现(相当于wrapper)：统一处理计时、异常兜底、输出回写
  async execute(...args: ExecuteFnArgs<TConfig>): Promise<NodeExecutionResult> {
    const [nodeId, config, context, logger] = args

    const startTime = Date.now()
    try {
      // 记录开始
      logger.nodeStart(nodeId, this.type, config)

      // 让子类做实现
      const result = await this.doExecute(nodeId, config, context, logger)
      // 成功时写入输入到ctx
      if (result.success) {
        context.setNodeOutputs(nodeId, result.outputs)
      }

      const final: NodeExecutionResult = {
        ...result,
        // 追加执行时间
        duration: Date.now() - startTime
      }

      logger.nodeEnd(nodeId, final)
      return final
    } catch (error) {
      const res: NodeExecutionResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        outputs: {},
        duration: Date.now() - startTime
      }

      logger.nodeEnd(nodeId, res)
      return res
    }
  }

  // ------------- 子类可调用的 utils

  // 变量解析器实例 由基类持有
  private readonly resolver = new VariableResolver()

  /** 解析模板字符串 */
  protected resolveTemplate(template: string, context: IExecutionContext) {
    return this.resolver.resolve(template, context)
  }
  /** 解析含模板字符串的配置对象（对象/数组 */
  protected resolveObject<T>(value: T, context: IExecutionContext): T {
    return this.resolver.resolveObject(value, context)
  }
}