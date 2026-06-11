import type { BodyType, HttpNodeConfig, NodeExecutionResult } from '../../types'
import { BaseNodeExecutor, type ExecuteFnArgs } from '../base-executor'

export class HttpExecutor extends BaseNodeExecutor<HttpNodeConfig> {
  readonly type = 'http'

  async doExecute(...args: ExecuteFnArgs<HttpNodeConfig>): Promise<NodeExecutionResult> {
    const [nodeId, config, context, logger] = args

    const {
      url: baseUrl,
      method,
      headers,
      params,
      bodyType,
      body,
      formData,
      timeout,
    } = this.resolveObject(config, context)

    let reqUrl = baseUrl
    const reqData: RequestInit = {
      method,
    }

    // ========= 解析 headers
    const resolveHeader = Object.fromEntries(
      headers.map(item => [item.key, item.value])
    )
    // ========= 解析 params
    const urlInst = new URL(reqUrl)
    params.forEach(item => {
      if (!item.key) return
      urlInst.searchParams.append(item.key, item.value)
    })
    reqUrl = urlInst.toString()
    // ========= 解析 body
    // 就近定义 实际应该移出, 这里只是方便学习参考
    const BODYTYPE_TO_CONTENT_TYPE: Record<BodyType, string> = {
      'none': '',
      'json': 'application/json',
      'form-data': 'multipart/form-data', // 仅做占位
      'raw': 'application/octet-stream',
      'binary': 'application/octet-stream',
    }

    let reqBody: BodyInit | null = null
    if (bodyType !== 'none') {
      if (bodyType === 'form-data') {
        // formData 不手动做 Content-Type, 由fetch自动设置
        const fd = new FormData()
        formData.forEach(item => fd.append(item.key, item.value))
        reqBody = fd
      }

      if (bodyType === 'json') {
        reqBody = JSON.stringify(body)
        resolveHeader['Content-Type'] = BODYTYPE_TO_CONTENT_TYPE[bodyType]
      } else {
        reqBody = body
        resolveHeader['Content-Type'] = BODYTYPE_TO_CONTENT_TYPE[bodyType]
      }

    }

    reqData.body = reqBody
    reqData.headers = resolveHeader

    const start = Date.now()

    logger.info(
      'http:request',
      'http request',
      nodeId,
      {
        url: reqUrl,
        method,
        headers: resolveHeader,
        params,
        bodyType,
        body,
        timeout,
      }
    )

    try {
      const rsp = await fetch(reqUrl, reqData)
      logger.info(
        'http:response', 
        'http response ok', 
        nodeId,
        {
          ...rsp,
          duration: Date.now() - start,
        }
      )

      return {
        success: true,
        outputs: {
          response: rsp,
        },
        duration: 0
      }

    } catch (error) {
      logger.error(
        'http:response',
        'http response error',
        nodeId,
        {
          error,
        }
      )
    }

  }
}