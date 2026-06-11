import type {
  NodeExecutionResult, ParamType, EndNodeConfig
} from '../../types'
import { BaseNodeExecutor, type ExecuteFnArgs } from '../base-executor'


export class EndExecutor extends BaseNodeExecutor<EndNodeConfig> {
  readonly type = 'end'

  private convertType(value: unknown, type: ParamType): unknown {
    switch (type) {
      case 'string': {
        if (value == null) return ''
        if (typeof value === 'string') return value
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value)
          } catch {
            return String(value)
          }
        }
        return String(value)
      }

      case 'boolean': {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0

        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase()
          if (normalized === 'true' || normalized === '1') return true
          if (normalized === 'false' || normalized === '0' || normalized === '') return false
        }

        return Boolean(value)
      }

      case 'number': {
        if (typeof value === 'number') return value
        if (typeof value === 'boolean') return value ? 1 : 0

        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (!trimmed) return 0
          const num = Number(trimmed)
          return Number.isNaN(num) ? value : num
        }

        return value
      }

      case 'array': {
        if (Array.isArray(value)) return value

        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : value
          } catch {
            return value
          }
        }

        return value
      }

      case 'object': {
        if (value === null || typeof value === 'object') return value

        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value)
            return parsed !== null && typeof parsed === 'object'
              ? parsed
              : value
          } catch {
            return value
          }
        }

        return value
      }

      default:
        return value
    }
  }

  protected async doExecute(...args: ExecuteFnArgs<EndNodeConfig>): Promise<NodeExecutionResult> {
    const [nodeId, config, context, logger] = args
    const outputs: NodeExecutionResult['outputs'] = {}

    for (const output of config.outputs) {
      let finalVal = this.resolveTemplate(output.value, context)
      finalVal = this.convertType(finalVal, output.type)
      outputs[output.name] = finalVal

      logger.debug(
        'node:end',
        `Output param: ${output.name} resolved`,
        nodeId,
        {
          name: output.name,
          expression: output.value,
          type: output.type,
          value: finalVal,
        }
      )

    }

    return {
      success: true,
      outputs,
      duration: 0,
    }

  }
}