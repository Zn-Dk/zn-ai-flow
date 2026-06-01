import { Catch, ExceptionFilter, HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common'
import { Response } from 'express'

export interface ErrorResponse {
  code: string
  message: string
  details?: unknown
}

// NestJS 内置异常响应结构
interface NestExceptionResponse {
  statusCode: number
  message: string | string[]
  error: string
}

export enum HttpCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

// 类型守卫：判断是否是自定义异常
function isCustomResponse(resp: unknown): resp is ErrorResponse {
  return typeof resp === 'object' && resp !== null && 'code' in resp
}

@Catch() // 捕获所有异常
export class HttpExceptionFilter implements ExceptionFilter {
  // 定义 logger, 参数为 HttpExceptionFilter 类名
  // 这样日志会包含类名，方便调试
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    // 使用 express 的 Response 类型
    const response = ctx.getResponse<Response>()

    // 响应头发送后, 跳过错误处理, 错误已经发送给客户端
    if (response.headersSent && exception instanceof Error) {
      this.logger.warn(`Response headers already sent. Exception: ${exception.message}`)
      return
    }

    // 默认错误
    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let errRsp: ErrorResponse = {
      code: HttpCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    }

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const expectionRsp = exception.getResponse()
      if (typeof expectionRsp === 'object' && expectionRsp !== null) {

        if (isCustomResponse(expectionRsp)) {
          // 自定义异常，直接用 code
          errRsp = {
            code: expectionRsp.code,
            message: expectionRsp.message,
            details: expectionRsp.details
          }
        } else {
          // NestJS 内置异常，从 status 映射 code
          const nestResp = expectionRsp as NestExceptionResponse
          const message = Array.isArray(nestResp.message) ? nestResp.message.join('; ') : nestResp.message
          errRsp = {
            code: this.mapStatusToCode(status),
            message
          }
        }

      } else {
        // string 类型
        errRsp = {
          code: this.mapStatusToCode(status),
          message: String(expectionRsp),
        }
      }
    } else if (exception instanceof Error) {
      // 最后: 未处理的错误
      this.logger.error(`Unhandled error: ${exception.message}`)
      errRsp = {
        code: 'UNHANDLED_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message,
      }
    }

    response.status(status).json(errRsp)
  }

  // 将 HTTP 状态码映射为语义化错误码
  private mapStatusToCode(status: number): string {
    const statusCodeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: HttpCode.BAD_REQUEST,
      [HttpStatus.UNAUTHORIZED]: HttpCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: HttpCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: HttpCode.NOT_FOUND,
      [HttpStatus.CONFLICT]: HttpCode.CONFLICT,
      [HttpStatus.TOO_MANY_REQUESTS]: HttpCode.RATE_LIMIT_EXCEEDED,
      [HttpStatus.UNPROCESSABLE_ENTITY]: HttpCode.VALIDATION_ERROR,
    }
    return statusCodeMap[status] || HttpCode.INTERNAL_SERVER_ERROR
  }
}