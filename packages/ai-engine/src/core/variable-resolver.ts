import type { ExecutionLogger } from '../types'
import type { IExecutionContext } from './context'

// 用于混合文本替换（如 `"结果：{{llm_1.result}}"`）
export const VARIABLE_REGEX = /\{\{\s*(.+?)\s*\}\}/g

// 纯变量整串 {{llm_1.result}}
export const PURE_VARIABLE_REGEX = /^\{\{\s*(.+?)\s*\}\}$/

export class VariableResolver {
  // 路径标准化：支持传入 "a.b.c" 或 ["a", "b", "c"]
  private normalizePath(path: string | string[]): string[] {
    if (Array.isArray(path)) {
      return path.map(item => item.trim()).filter(Boolean)
    }

    return path
      .split('.')
      .map(item => item.trim())
      .filter(Boolean)
  }

  // 类 lodash.get，内部只处理分段后的路径
  private getByPath(obj: unknown, path: string | string[]): unknown {
    let current: unknown = obj
    const segments = this.normalizePath(path)

    for (const key of segments) {
      if (current === null || current === undefined) return undefined

      if (typeof current !== 'object') return undefined

      current = (current as Record<string, unknown>)[key]
    }

    return current
  }

  // 解析变量表达式（如 llm_1.result）
  private resolveExpression(expr: string, ctx: IExecutionContext, logger?: ExecutionLogger): unknown {
    const segments = expr.split('.').map(item => item.trim()).filter(Boolean)
    // 小于2代表直接写成了节点id, 这是无效的引用
    if (segments.length < 2) return
    const [nodeId, ...fieldPath] = segments
    if (!nodeId) return

    const outputs = ctx.getNodeOutputs(nodeId)
    if (!outputs) return

    return this.getByPath(outputs, fieldPath)
  }

  // 解析模板字符串
  resolve(template: string, ctx: IExecutionContext, logger?: ExecutionLogger): unknown {
    // 情况1：整串就是变量引用，返回原始类型
    const fullMatch = template.match(PURE_VARIABLE_REGEX)
    if (fullMatch) {
      const res = this.resolveExpression(fullMatch[1]!, ctx)
      return res === undefined ? template : res
    }

    // 情况2：混合文本，替换为字符串
    return template.replace(VARIABLE_REGEX, (raw, expr: string) => {
      // 每一个都是 {{ xx }}
      const res = this.resolveExpression(expr, ctx)

      // 基础类型
      if (res === undefined) return raw
      if (typeof res === 'string') return res
      if (['number', 'boolean', 'bigint'].some(t => typeof res === t)) return String(res)

      // obj/arr 序列化
      try {
        return JSON.stringify(res)
      } catch (error) {
        console.error('error in resolve', error)
        return String(res)
      }
    })
  }

  // 递归解析对象/数组中的模板字符串
  resolveObject<T>(obj: T, ctx: IExecutionContext): T {
    if (!obj) return obj
    if (typeof obj === 'string') {
      return this.resolve(obj, ctx) as T
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, ctx)) as T
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObject(value, ctx)
      }
      return result as T
    }

    return obj
  }
}

export function createVariableResolver(): VariableResolver {
  return new VariableResolver()
}