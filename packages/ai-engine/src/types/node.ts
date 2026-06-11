// #region ---------------------------- Param ----------------------------

// 参数的值类型
export type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'

export interface Param {
  name: string
  type: ParamType
  description?: string
}

export interface InputParam extends Param {
  /**
   * 默认值, 解析按type识别,
   * @example
   * {
      name: 'maxRetry',
      type: 'number',
      defaultValue: '3'       // 字符串 "3"，运行时转为 number
    }

    // 布尔常量
    {
      name: 'verbose',
      type: 'boolean',
      defaultValue: 'true'    // 字符串 "true"，运行时转为 boolean
    }

    // 表达式
    {
      name: 'timeout',
      type: 'number',
      defaultValue: '{{env.default_timeout}}'  // 运行时解析
    }
  */
  defaultValue?: string
  required?: boolean
}

export interface OutputParam extends Param {
  /**
   * 输出
   * 参考 input defaultValue 解析规则
   */
  value: string
}

// #endregion ---------------------------- Param ----------------------------
// #region ---------------------------- 节点配置 ----------------------------

// 可用节点类型
export type NodeType =
| 'start'
| 'end'
| 'llm'
| 'http'
| 'intent'
| 'condition'
| 'knowledge'

/**
 * START 节点配置
 * @member inputs 输入参数
 */
export interface StartNodeConfig {
  inputs: InputParam[]
}

/**
 * 结束节点配置
 * @member outputs 输出参数
 */
export interface EndNodeConfig {
  outputs: OutputParam[]
}


/**
 * LLM 节点配置
 * @member model 模型名称
 * @member messages 消息列表
 * @member temperature 温度
 */
export interface LLMNodeConfig {
  model: string
  // systemPrompt?: string
  // userPrompt: string
  // assistantPrompt?: string
  messages: LlmMessageConfig[]
  temperature?: number
  // ollama 的上下文长度
  numCtx?: number
  // maxTokens?: number
}
// 对齐dify 的 llm 形式
// 即
// 默认结构：初始就有两条消息
// SYSTEM
// USER

// 追加能力：用户点击“添加消息”后，只能继续追加
// USER
// ASSISTANT
export type LlmMessageRole = 'system' | 'user' | 'assistant'

export interface LlmMessageConfig {
  role: LlmMessageRole;
  content: string;
}



/** HTTP 节点配置 */
export interface HttpNodeConfig {
  url: string
  method: HttpMethod
  headers: KVPair[] // http 自定义请求头
  params: KVPair[]
  bodyType: BodyType
  body: string // json 请求体
  formData: KVPair[] // form-data 格式
  timeout?: number // ms , 默认 30000ms
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type KVPair = {
  key: string
  value: string
}

/**
 * Body 类型
 * @description 只先实现 json 和 form-data.
 * 优先实现 json — 最简单也最常用，直接透传 body 字符串即可
      form-data 可以先跳过或简化实现（没有真正的 multipart）
      x-www-form-urlencoded — 如果要做，用 URLSearchParams 即可，很简单
      其他先不管
 */
export type BodyType = 'none' | 'form-data' | 'json' | 'raw' | 'binary'


/**
 * 意图节点配置
 */
export interface IntentNodeConfig {
  model: string
  intents: Intent[]
}

/**
 * 意图定义
 */
export interface Intent {
  name: string
  description?: string
  condition?: string
}


/**
 * 条件节点配置（纯规则，后续实现）
 * */
export interface ConditionNodeConfig {
  conditions: ConditionRule[]
}

/** 条件规则 */
export interface ConditionRule {
  id: string // 对应 edge 的 sourceHandle
  variable: string // 变量引用，如 '{{http_1.status}}'
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'notContains' | 'empty' | 'notEmpty'
  value?: string // 比较值
}


/**
 * 知识库节点配置
 *
 */
export interface KnowledgeNodeConfig {
  /** 知识库 ID 列表 */
  knowledgeBaseIds: string[]
  /** 查询字符串 */
  query: string
  /** 检索模式 */
  retrievalMode: KnowledgeRetrievalMode
  /** llm 参数(前 K 条) */
  topK: number
  /** 相似度阈值 0-1 */
  threshold?: number
  /** 输出格式 */
  outputFormat: KnowledgeOutputFormat
}

/**
 * 知识库检索模式
 * vector 向量检索
 * fulltext 全文检索
 * hybrid 混合检索
 */
export type KnowledgeRetrievalMode = 'vector' | 'fulltext' | 'hybrid'

/**
 * 知识库检索输出格式
 */
export type KnowledgeOutputFormat = 'text' | 'json'

// #endregion ---------------------------- 节点配置 ----------------------------
// #region ---------------------------- 节点执行 ----------------------------

export interface NodeExecutionResult {
  success: boolean
  error?: Error
  duration: number
  /** 节点输入（从上游节点输出解析后的值） */
  inputs?: Record<string, unknown>
  /** 输出 */
  outputs: Record<string, unknown>
  // matchedBranch TODO
}

// #endregion ---------------------------- 节点执行 ----------------------------