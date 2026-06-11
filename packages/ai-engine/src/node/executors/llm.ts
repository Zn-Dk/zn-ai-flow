import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'

import type { LlmMessageRole, LLMNodeConfig, NodeExecutionResult } from '../../types'
import { BaseNodeExecutor, type ExecuteFnArgs } from '../base-executor'

const MSG_TYPE_TO_LLM_ROLE: Record<'ai' | 'human' | 'system', LlmMessageRole> = {
  ai: 'assistant',
  human: 'user',
  system: 'system',
}

export class LLMExecutor extends BaseNodeExecutor<LLMNodeConfig> {
  readonly type = 'llm'


  async doExecute(...args: ExecuteFnArgs<LLMNodeConfig>): Promise<NodeExecutionResult> {
    const [nodeId, config, context, logger] = args

    const resolvedConfig = this.resolveObject(config, context)
    const messages = resolvedConfig.messages
      .map(item => {
        switch (item.role) {
          case 'system':
            return new SystemMessage({ content: item.content })
          case 'user':
            return new HumanMessage({ content: item.content })
          case 'assistant':
            return new AIMessage({ content: item.content })
          default:
            throw new Error(`Unknown role: ${item.role}`)
        }
      })

    // miaoma 的写法, 仅留作参考
    // if (resolvedConfig.systemPrompt) {
    //   messages.push(new SystemMessage({ content: resolvedConfig.systemPrompt }))
    // }
    // if (resolvedConfig.userPrompt) {
    //   messages.push(new HumanMessage({ content: resolvedConfig.userPrompt }))
    // }
    // if (resolvedConfig.assistantPrompt) {
    //   messages.push(new AIMessage({ content: resolvedConfig.assistantPrompt }))
    // }

    logger.info('llm:request', 'llm request', nodeId, {
      ...resolvedConfig,
      messages: messages.map((msg) => ({
        role: MSG_TYPE_TO_LLM_ROLE[msg.type],
        content: msg.content,
      })),
    })

    const llm = new ChatOllama({
      model: resolvedConfig.model,
      temperature: resolvedConfig.temperature ?? 0.7,
      numCtx: resolvedConfig.numCtx ?? 4096,
    })

    const startTime = Date.now()
    const rsp = await llm.invoke(messages)
    const duration = Date.now() - startTime

    const content = typeof rsp.content === 'string'
      ? rsp.content
      : rsp.content.map(i => i.text).join('')
    const tokens = this.estimateTokens(content)

    logger.info('llm:response', 'llm response', nodeId, {
      content,
      tokens,
      duration,
    })

    return {
      success: true,
      outputs: {
        content,
        tokens,
      },
      duration,
    }
  }

  private estimateTokens(text: string): number {
    // 简单估算：中文约1.5字符/token，英文约4字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars / 1.5 + otherChars / 4)
  }
}