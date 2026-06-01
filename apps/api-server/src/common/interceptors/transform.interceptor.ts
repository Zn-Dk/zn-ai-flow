import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

/**
 * 统一成功响应格式
 * 失败响应由 GlobalExceptionFilter 处理，结构为 ErrorResponse
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * 响应转换拦截器
 * 职责：将 Controller 的返回值统一包装为 { success: true, data } 格式
 *
 * 工作流程：请求 → Controller 返回 data → pipe(map) 包装 → 发送给客户端
 * 注意：此处不使用 context 参数，因为纯数据包装不依赖请求上下文信息
 */
export class TransformInterceptor<T>
implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    // next.handle() 返回 Controller 方法的返回值（Observable 流）
    // 通过 map 操作符对返回值做纯函数变换，包装为统一格式
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
      })),
    )
  }
}