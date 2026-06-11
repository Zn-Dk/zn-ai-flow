import type {
  NodeExecutionResult, ParamType, StartNodeConfig
} from '../../types'
import { BaseNodeExecutor, type ExecuteFnArgs } from '../base-executor'


export class StartExecutor extends BaseNodeExecutor<StartNodeConfig> {
  readonly type = 'start'

  private parseDefaultValue(value: string, type: ParamType) {
    switch (type) {
      case 'string':
        return value
      case 'boolean':
        return value.toLowerCase() === 'true'
      case 'number':
        return Number(value)
      case 'array':
      case 'object':
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      default:
        return value
    }
  }

  protected async doExecute(...args: ExecuteFnArgs<StartNodeConfig>): Promise<NodeExecutionResult> {
    const [nodeId, config, context, logger] = args
    const workflowInputs = context.getInputs()
    const outputs: NodeExecutionResult['outputs'] = {}

    for (const param of config.inputs) {
      let value = workflowInputs[param.name]
      if (param.required && value === undefined) {
        throw new Error(`Missing parameter: ${param.name}`)
      }

      // 有默认值且未配置, 提供默认值
      if (value === undefined && param.defaultValue !== undefined) {
        value = this.parseDefaultValue(param.defaultValue, param.type)

        logger.debug(
          'node:start',
          `Default value resolved for ${param.name}`,
          nodeId,
          { name: param.name, defaultValue: param.defaultValue, parsedValue: value }
        )
      }

      logger.debug(
        'node:start',
        `Input value resolved for ${param.name}`,
        nodeId,
        { name: param.name, type: param.type, value }
      )

      outputs[param.name] = value
    }

    return {
      success: true,
      outputs,
      duration: 0,
    }

  }
}