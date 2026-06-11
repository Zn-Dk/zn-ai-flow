import type { NodeType } from '../types'
import type { INodeExecutor } from './base-executor'
import { EndExecutor } from './executors/end'
import { HttpExecutor } from './executors/http'
import { LLMExecutor } from './executors/llm'
import { StartExecutor } from './executors/start'

/** 节点注册表 */
class NodeRegistry {
  private executors = new Map<NodeType, INodeExecutor>()

  register(exector: INodeExecutor<unknown>) {
    if (this.executors.has(exector.type)) {
      console.log(`节点: ${exector.type} 的执行器已被覆盖`)
    }
    this.executors.set(exector.type, exector)
  }

  get(type: NodeType): INodeExecutor<unknown> | undefined {
    return this.executors.get(type)
  }

  has(type: NodeType) {
    return this.executors.has(type)
  }

  getRegisteredTypes(){
    return Array.from(this.executors.keys())
  }

  // TODO --------

  // unregister
  // clear
}

export function createNodeRegistry() {
  return new NodeRegistry()
}

/** 注册内置节点执行器
 * TODO
 */
export function createDefaultNodeRegistry() {
  const registry = new NodeRegistry()

  registry.register(new StartExecutor())
  registry.register(new EndExecutor())
  registry.register(new HttpExecutor())
  registry.register(new LLMExecutor())

  return registry
}